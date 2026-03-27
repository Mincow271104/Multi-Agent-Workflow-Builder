// ===================================================================
// Orchestrator — Core Multi-Agent Workflow Execution Engine
// ===================================================================
//
// This module takes a workflow definition (React Flow format: nodes +
// edges) and executes AI agents in the correct order — sequential or
// parallel — based on the graph topology.
//
// KEY FEATURES:
//  1. Topological sort — resolves execution order from edges
//  2. Parallel execution — agents at the same depth level run concurrently
//  3. Shared memory — agents can read/write to a shared context object
//  4. Streaming output — each agent streams tokens via Socket.io
//  5. Prisma persistence — logs and results saved to the Execution model
//  6. Graceful error handling — failures are logged and emitted
//
// USAGE:
//   import { Orchestrator } from './orchestrator';
//   const orchestrator = new Orchestrator(io);
//   await orchestrator.execute(executionId, workflowConfig, userInput);
//
// ===================================================================

import { Server as SocketIOServer } from 'socket.io';
import prisma from '../config/db';
import { logger } from '../utils';
import { ServerEvents } from '../models/types';
import {
  getAIProvider,
  type ProviderName,
  type ChatMessage,
} from './aiProviders';

// ─── Types — React Flow Workflow Format ─────────────────────────

/**
 * A single node in the React Flow graph — represents one AI agent.
 *
 * The `data` field carries configuration set by the user in the
 * workflow builder UI.
 */
export interface WorkflowNode {
  /** Unique node ID (React Flow generated, e.g. "node_1") */
  id: string;

  /** Node type — used by React Flow for rendering */
  type?: string;

  /** Position on the canvas (not used at runtime, only UI) */
  position?: { x: number; y: number };

  /** Agent configuration stored in the node */
  data: {
    /** Display label / agent name */
    label: string;

    /** Agent role (e.g. "Researcher", "Writer", "Critic", "Publisher") */
    role: string;

    /** Which AI provider to use */
    provider: ProviderName;

    /** Model identifier (e.g. "llama3", "gemini-pro") */
    model: string;

    /** System prompt that defines the agent's behavior */
    systemPrompt?: string;

    /** Optional provider-specific config overrides */
    temperature?: number;
    maxTokens?: number;

    /**
     * If true, this agent's output is included in the final result.
     * Default: only the last agent's output is the final result.
     */
    isFinalOutput?: boolean;
  };
}

/**
 * An edge connecting two nodes — defines execution dependencies.
 *
 * If edge goes from A → B, then A must complete before B starts.
 * Nodes with no incoming edges run first; nodes at the same depth
 * level run in parallel.
 */
export interface WorkflowEdge {
  /** Unique edge ID */
  id: string;
  /** Source node ID (upstream agent) */
  source: string;
  /** Target node ID (downstream agent) */
  target: string;
  /** Optional label on the edge */
  label?: string;
}

/**
 * The full workflow configuration as stored in workflow.config JSON.
 * This matches the React Flow export format.
 */
export interface WorkflowConfig {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

// ─── Types — Execution Context ──────────────────────────────────

/**
 * Shared memory / context that persists across all agent executions
 * within a single workflow run. Agents can read from and write to
 * this object to share information.
 */
export interface SharedMemory {
  /** The original user input that kicked off the execution */
  userInput: string;

  /** Map of agentNodeId → that agent's full output */
  agentOutputs: Record<string, string>;

  /** Free-form key-value store agents can use to pass data */
  variables: Record<string, unknown>;

  /** Running conversation history across agents */
  conversationHistory: ChatMessage[];
}

/**
 * Log entry for a single agent execution step.
 * Stored in the Execution.logs JSON field.
 */
export interface AgentStepLog {
  nodeId: string;
  agentName: string;
  role: string;
  provider: ProviderName;
  model: string;
  status: 'running' | 'completed' | 'failed';
  input: string;
  output: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

// ─── Orchestrator Class ─────────────────────────────────────────

export class Orchestrator {
  private io: SocketIOServer;

  /** Set of execution IDs that have been requested to cancel */
  private cancelledExecutions = new Set<string>();

  constructor(io: SocketIOServer) {
    this.io = io;
  }

  // ══════════════════════════════════════════════════════════════
  // ██  PUBLIC — Main execute() method
  // ══════════════════════════════════════════════════════════════

  /**
   * Execute a workflow by running its agents in topological order.
   *
   * @param executionId     Prisma Execution record ID
   * @param workflowConfig  { nodes, edges } from React Flow
   * @param userInput       The user's input / prompt to the workflow
   * @returns               The final Execution record from Prisma
   */
  async execute(
    executionId: string,
    workflowConfig: WorkflowConfig,
    userInput: string,
  ) {
    const { nodes, edges } = workflowConfig;
    const workflowId = await this.getWorkflowId(executionId);

    // 1. Mark execution as RUNNING
    await this.updateExecutionStatus(executionId, 'RUNNING', workflowId);

    // 2. Build execution order (topological sort → grouped by depth level)
    const executionLevels = this.buildExecutionLevels(nodes, edges);
    logger.info(
      `[Orchestrator] Execution ${executionId}: ${nodes.length} agents in ${executionLevels.length} levels`,
    );

    // 3. Initialize shared memory
    const memory: SharedMemory = {
      userInput,
      agentOutputs: {},
      variables: {},
      conversationHistory: [],
    };

    // 4. Execute level by level
    const stepLogs: AgentStepLog[] = [];

    try {
      for (let level = 0; level < executionLevels.length; level++) {
        const levelNodes = executionLevels[level];

        // Check for cancellation before each level
        if (this.cancelledExecutions.has(executionId)) {
          logger.info(`[Orchestrator] Execution ${executionId} was cancelled.`);
          this.cancelledExecutions.delete(executionId);
          return this.finalizeExecution(executionId, workflowId, 'CANCELLED', stepLogs, memory);
        }

        logger.info(
          `[Orchestrator] Level ${level + 1}/${executionLevels.length}: ` +
          `running ${levelNodes.length} agent(s) ${levelNodes.length > 1 ? 'in PARALLEL' : 'SEQUENTIALLY'}`,
        );

        // Run all agents at this level in parallel
        const levelResults = await Promise.allSettled(
          levelNodes.map((node) =>
            this.executeAgent(executionId, workflowId, node, edges, memory, stepLogs),
          ),
        );

        // Check if any agent at this level failed
        const failures = levelResults.filter((r) => r.status === 'rejected');
        if (failures.length > 0) {
          const errorMsgs = failures.map(
            (f) => (f as PromiseRejectedResult).reason?.message || 'Unknown error',
          );
          logger.error(
            `[Orchestrator] Level ${level + 1} had ${failures.length} failure(s): ${errorMsgs.join(', ')}`,
          );

          // If ALL agents at a level failed, abort the execution
          if (failures.length === levelNodes.length) {
            throw new Error(`All agents at level ${level + 1} failed: ${errorMsgs.join('; ')}`);
          }
          // If only some failed, continue with warnings (partial results)
          logger.warn('[Orchestrator] Continuing with partial results from this level.');
        }
      }

      // 5. Build final result
      return this.finalizeExecution(executionId, workflowId, 'COMPLETED', stepLogs, memory);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[Orchestrator] Execution ${executionId} failed: ${errorMessage}`);

      return this.finalizeExecution(executionId, workflowId, 'FAILED', stepLogs, memory, errorMessage);
    }
  }

  /**
   * Request cancellation of a running execution.
   * The orchestrator checks this flag before each level.
   */
  cancel(executionId: string): void {
    this.cancelledExecutions.add(executionId);
    logger.info(`[Orchestrator] Cancellation requested for execution ${executionId}`);
  }

  // ══════════════════════════════════════════════════════════════
  // ██  PRIVATE — Execute a single agent node
  // ══════════════════════════════════════════════════════════════

  /**
   * Execute a single agent node:
   *  1. Gather context from parent agents (via edges)
   *  2. Build the prompt with system message + context
   *  3. Stream the AI response, emitting chunks via Socket.io
   *  4. Store the output in shared memory
   *  5. Log the step
   */
  private async executeAgent(
    executionId: string,
    workflowId: string,
    node: WorkflowNode,
    edges: WorkflowEdge[],
    memory: SharedMemory,
    stepLogs: AgentStepLog[],
  ): Promise<string> {
    const startTime = Date.now();
    const { data } = node;

    const stepLog: AgentStepLog = {
      nodeId: node.id,
      agentName: data.label,
      role: data.role,
      provider: data.provider,
      model: data.model,
      status: 'running',
      input: '',
      output: '',
      startedAt: new Date().toISOString(),
    };

    try {
      // ── 1. Gather context from parent agents ────────────────────

      const parentNodeIds = edges
        .filter((e) => e.target === node.id)
        .map((e) => e.source);

      // Build the input context from parent outputs + user input
      let contextInput: string;
      if (parentNodeIds.length === 0) {
        // Root node — use the original user input
        contextInput = memory.userInput;
      } else {
        // Non-root node — combine parent outputs as context
        const parentOutputs = parentNodeIds
          .filter((pid) => memory.agentOutputs[pid]) // Only include completed parents
          .map((pid) => {
            return `--- Output from previous agent (${pid}) ---\n${memory.agentOutputs[pid]}`;
          })
          .join('\n\n');

        contextInput = parentOutputs
          ? `${parentOutputs}\n\n--- Original User Input ---\n${memory.userInput}`
          : memory.userInput;
      }

      stepLog.input = contextInput;

      // ── 2. Build chat messages ──────────────────────────────────

      const messages: ChatMessage[] = [];

      // System prompt — defines the agent's role and behavior
      const systemPrompt = this.buildSystemPrompt(data.role, data.systemPrompt);
      messages.push({ role: 'system', content: systemPrompt });

      // Include relevant conversation history for continuity
      // (last 3 exchanges to avoid context overflow)
      const recentHistory = memory.conversationHistory.slice(-6);
      messages.push(...recentHistory);

      // Current user message with the gathered context
      messages.push({ role: 'user', content: contextInput });

      // ── 3. Emit "agent started" event ───────────────────────────

      this.emitAgentEvent(workflowId, executionId, node.id, {
        status: 'running',
        agentName: data.label,
        role: data.role,
        provider: data.provider,
        model: data.model,
      });

      // ── 4. Stream AI response ───────────────────────────────────

      const provider = getAIProvider(data.provider);
      let fullOutput = '';

      // Use streaming for real-time output
      for await (const chunk of provider.chatStream({
        model: data.model,
        messages,
        temperature: data.temperature ?? 0.7,
        maxTokens: data.maxTokens ?? 2048,
      })) {
        fullOutput += chunk;

        // Emit each chunk to the frontend via Socket.io
        this.emitAgentEvent(workflowId, executionId, node.id, {
          status: 'streaming',
          agentName: data.label,
          chunk,
          fullOutput, // Send accumulated output too
        });
      }

      // ── 5. Store output in shared memory ────────────────────────

      memory.agentOutputs[node.id] = fullOutput;

      // Add to conversation history for downstream agents
      memory.conversationHistory.push(
        { role: 'user', content: `[${data.role}] Task: ${contextInput.slice(0, 200)}...` },
        { role: 'assistant', content: fullOutput },
      );

      // ── 6. Complete the step log ────────────────────────────────

      const durationMs = Date.now() - startTime;
      stepLog.status = 'completed';
      stepLog.output = fullOutput;
      stepLog.completedAt = new Date().toISOString();
      stepLog.durationMs = durationMs;
      stepLogs.push(stepLog);

      // ── 7. Emit "agent completed" event ─────────────────────────

      this.emitAgentEvent(workflowId, executionId, node.id, {
        status: 'completed',
        agentName: data.label,
        role: data.role,
        output: fullOutput,
        durationMs,
      });

      logger.info(
        `[Orchestrator] Agent "${data.label}" (${data.role}) completed in ${durationMs}ms ` +
        `— output: ${fullOutput.length} chars`,
      );

      return fullOutput;
    } catch (error) {
      // ── Error handling ────────────────────────────────────────────

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const durationMs = Date.now() - startTime;

      stepLog.status = 'failed';
      stepLog.error = errorMessage;
      stepLog.completedAt = new Date().toISOString();
      stepLog.durationMs = durationMs;
      stepLogs.push(stepLog);

      // Emit error event
      this.emitAgentEvent(workflowId, executionId, node.id, {
        status: 'failed',
        agentName: data.label,
        role: data.role,
        error: errorMessage,
      });

      logger.error(`[Orchestrator] Agent "${data.label}" failed: ${errorMessage}`);
      throw error; // Re-throw so Promise.allSettled captures it
    }
  }

  // ══════════════════════════════════════════════════════════════
  // ██  PRIVATE — Graph Utilities
  // ══════════════════════════════════════════════════════════════

  /**
   * Build execution levels using topological sort (Kahn's algorithm).
   *
   * Groups nodes by their "depth" in the DAG. Nodes at the same depth
   * have no dependencies between them and can run in parallel.
   *
   * Example:
   *   A → B → D
   *   A → C → D
   *
   *   Level 0: [A]       (no incoming edges)
   *   Level 1: [B, C]    (both depend only on A — run in parallel)
   *   Level 2: [D]       (depends on B and C)
   *
   * @param nodes  All workflow nodes
   * @param edges  All workflow edges
   * @returns      Array of arrays — each inner array is a parallel execution group
   */
  private buildExecutionLevels(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
  ): WorkflowNode[][] {
    // Build adjacency list and in-degree count
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();
    const nodeMap = new Map<string, WorkflowNode>();

    for (const node of nodes) {
      inDegree.set(node.id, 0);
      adjacency.set(node.id, []);
      nodeMap.set(node.id, node);
    }

    for (const edge of edges) {
      const current = inDegree.get(edge.target) ?? 0;
      inDegree.set(edge.target, current + 1);

      const neighbors = adjacency.get(edge.source) ?? [];
      neighbors.push(edge.target);
      adjacency.set(edge.source, neighbors);
    }

    // Kahn's algorithm — BFS level by level
    const levels: WorkflowNode[][] = [];
    let currentLevel = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0);

    while (currentLevel.length > 0) {
      levels.push(currentLevel);

      const nextLevel: WorkflowNode[] = [];

      for (const node of currentLevel) {
        const neighbors = adjacency.get(node.id) ?? [];
        for (const neighborId of neighbors) {
          const degree = (inDegree.get(neighborId) ?? 0) - 1;
          inDegree.set(neighborId, degree);

          if (degree === 0) {
            const neighborNode = nodeMap.get(neighborId);
            if (neighborNode) {
              nextLevel.push(neighborNode);
            }
          }
        }
      }

      currentLevel = nextLevel;
    }

    // Detect cycles (nodes not processed = cycle)
    const processedCount = levels.reduce((sum, lvl) => sum + lvl.length, 0);
    if (processedCount < nodes.length) {
      const unprocessed = nodes
        .filter((n) => !levels.flat().includes(n))
        .map((n) => n.data.label)
        .join(', ');
      logger.warn(`[Orchestrator] Cycle detected! Unprocessed agents: ${unprocessed}`);
      throw new Error(`Workflow contains a cycle. Agents in cycle: ${unprocessed}`);
    }

    return levels;
  }

  // ══════════════════════════════════════════════════════════════
  // ██  PRIVATE — Prompt Building
  // ══════════════════════════════════════════════════════════════

  /**
   * Build a system prompt that incorporates the agent's role.
   *
   * If the user provided a custom system prompt, it is used as-is
   * with the role prepended. Otherwise, a default prompt is generated
   * based on the role name.
   */
  private buildSystemPrompt(role: string, customPrompt?: string): string {
    if (customPrompt) {
      return `You are a ${role} agent.\n\n${customPrompt}`;
    }

    // Default role-based system prompts
    const rolePrompts: Record<string, string> = {
      researcher: [
        `You are a Researcher agent. Your job is to analyze the given topic thoroughly.`,
        `Provide well-structured research findings with key facts, data points, and insights.`,
        `Cite sources when possible. Be thorough but concise.`,
      ].join('\n'),

      writer: [
        `You are a Writer agent. Your job is to create well-written content based on the provided research and context.`,
        `Write in a clear, engaging, and professional tone.`,
        `Structure your output with headings, paragraphs, and bullet points as appropriate.`,
      ].join('\n'),

      critic: [
        `You are a Critic agent. Your job is to review the provided content critically.`,
        `Identify weaknesses, factual errors, logical gaps, and areas for improvement.`,
        `Provide specific, actionable feedback. Be constructive but thorough.`,
      ].join('\n'),

      publisher: [
        `You are a Publisher agent. Your job is to finalize and polish the content.`,
        `Apply final edits: fix grammar, improve formatting, ensure consistency.`,
        `Output the final, publication-ready version of the content.`,
      ].join('\n'),

      summarizer: [
        `You are a Summarizer agent. Your job is to create concise summaries.`,
        `Distill the key points from the input into a clear, brief summary.`,
        `Maintain accuracy while reducing length significantly.`,
      ].join('\n'),

      coder: [
        `You are a Coder agent. Your job is to write, review, or debug code.`,
        `Produce clean, well-commented code following best practices.`,
        `Include error handling and explain your implementation decisions.`,
      ].join('\n'),

      translator: [
        `You are a Translator agent. Your job is to translate content between languages.`,
        `Maintain the original meaning, tone, and nuance in your translation.`,
        `If the target language is not specified, ask or infer from context.`,
      ].join('\n'),
    };

    const normalized = role.toLowerCase().trim();
    return rolePrompts[normalized] || `You are a ${role} agent. Complete the given task to the best of your ability.`;
  }

  // ══════════════════════════════════════════════════════════════
  // ██  PRIVATE — Database & Socket Helpers
  // ══════════════════════════════════════════════════════════════

  /**
   * Get the workflowId from an execution record.
   */
  private async getWorkflowId(executionId: string): Promise<string> {
    const execution = await prisma.execution.findUnique({
      where: { id: executionId },
      select: { workflowId: true },
    });

    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    return execution.workflowId;
  }

  /**
   * Update execution status in Prisma and emit Socket.io event.
   */
  private async updateExecutionStatus(
    executionId: string,
    status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED',
    workflowId: string,
  ) {
    const data: Record<string, unknown> = { status };

    if (status === 'RUNNING') {
      data.startedAt = new Date();
    }
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(status)) {
      data.completedAt = new Date();
    }

    await prisma.execution.update({
      where: { id: executionId },
      data,
    });

    // Emit status change to all clients watching this workflow
    this.io.to(`workflow:${workflowId}`).emit(ServerEvents.EXECUTION_STATUS, {
      executionId,
      status,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit an agent-level event via Socket.io.
   * Clients use these to update individual agent cards in the UI.
   */
  private emitAgentEvent(
    workflowId: string,
    executionId: string,
    nodeId: string,
    payload: Record<string, unknown>,
  ) {
    this.io.to(`workflow:${workflowId}`).emit(ServerEvents.AGENT_OUTPUT, {
      executionId,
      nodeId,
      timestamp: new Date().toISOString(),
      ...payload,
    });
  }

  /**
   * Finalize the execution — save results and logs to Prisma,
   * emit final status event.
   */
  private async finalizeExecution(
    executionId: string,
    workflowId: string,
    status: 'COMPLETED' | 'FAILED' | 'CANCELLED',
    stepLogs: AgentStepLog[],
    memory: SharedMemory,
    errorMessage?: string,
  ) {
    // Determine the final output:
    // - Use the last agent's output, OR
    // - Use outputs from agents marked as isFinalOutput
    const allOutputs = Object.values(memory.agentOutputs);
    const finalOutput = allOutputs.length > 0 ? allOutputs[allOutputs.length - 1] : '';

    const result: Record<string, unknown> = {
      output: finalOutput,
      allAgentOutputs: memory.agentOutputs,
      variables: memory.variables,
    };

    if (errorMessage) {
      result.error = errorMessage;
    }

    // Persist to database
    const execution = await prisma.execution.update({
      where: { id: executionId },
      data: {
        status,
        result: JSON.parse(JSON.stringify(result)),
        logs: JSON.parse(JSON.stringify(stepLogs)),
        completedAt: new Date(),
      },
    });

    // Emit final status
    this.io.to(`workflow:${workflowId}`).emit(ServerEvents.EXECUTION_STATUS, {
      executionId,
      status,
      result,
      timestamp: new Date().toISOString(),
    });

    logger.info(
      `[Orchestrator] Execution ${executionId} finalized: ${status} ` +
      `(${stepLogs.length} steps, ${stepLogs.filter((s) => s.status === 'completed').length} succeeded)`,
    );

    return execution;
  }
}

// ─── Default Export ─────────────────────────────────────────────

export default Orchestrator;
