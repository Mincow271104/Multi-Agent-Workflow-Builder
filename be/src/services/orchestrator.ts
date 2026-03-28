import { Server as SocketIOServer } from 'socket.io';
import prisma from '../config/db';
import { logger } from '../utils';
import { ServerEvents } from '../models/types';
import { getAIProvider, type ProviderName, type ChatMessage } from './aiProviders';
import { parseAgentOutput, extractOrchestratorContent } from './agentOutputParser';

export interface WorkflowNode {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  data: {
    label: string;
    role: string;
    provider: ProviderName;
    model: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    isFinalOutput?: boolean;
  };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface WorkflowConfig {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface SharedMemory {
  userInput: string;
  language: string;
  agentOutputs: Record<string, string>;
  variables: Record<string, unknown>;
  conversationHistory: ChatMessage[];
}

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

export class Orchestrator {
  private io: SocketIOServer;
  private cancelledExecutions = new Set<string>();
  private abortControllers = new Map<string, AbortController>();

  constructor(io: SocketIOServer) {
    this.io = io;
  }

  async execute(
    executionId: string,
    workflowConfig: WorkflowConfig,
    userInput: string,
    language: string = 'en'
  ) {
    const { nodes, edges } = workflowConfig;
    const workflowId = await this.getWorkflowId(executionId);

    await this.updateExecutionStatus(executionId, 'RUNNING', workflowId);

    const orchestratorNode = nodes.find((n) => n.data.role?.toLowerCase() === 'orchestrator');
    logger.info(`[Orchestrator] Execution ${executionId}: ${nodes.length} agents (Mode: ${orchestratorNode ? 'DYNAMIC HYBRID' : 'WATERFALL'})`);

    const memory: SharedMemory = {
      userInput,
      language,
      agentOutputs: {},
      variables: {},
      conversationHistory: [],
    };

    const stepLogs: AgentStepLog[] = [];

    try {
      if (orchestratorNode && edges.length === 0) {
        await this.executeDynamic(executionId, workflowId, nodes, orchestratorNode, memory, stepLogs);
      } else if (orchestratorNode && edges.length > 0) {
        await this.executeHybridSupervisor(executionId, workflowId, nodes, edges, orchestratorNode, memory, stepLogs);
      } else {
        await this.executeWaterfall(executionId, workflowId, nodes, edges, memory, stepLogs);
      }

      return this.finalizeExecution(executionId, workflowId, 'COMPLETED', stepLogs, memory);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isAborted = this.cancelledExecutions.has(executionId) || 
                         (error instanceof Error && error.name === 'AbortError') ||
                         errorMessage.includes('abort') ||
                         errorMessage.includes('stopped by user');
      
      if (isAborted) {
        this.cancelledExecutions.delete(executionId);
        logger.info(`[Orchestrator] Execution ${executionId} stopped by user.`);
        return this.finalizeExecution(executionId, workflowId, 'CANCELLED', stepLogs, memory, 'Execution stopped by user');
      }

      logger.error(`[Orchestrator] Execution ${executionId} failed: ${errorMessage}`);
      return this.finalizeExecution(executionId, workflowId, 'FAILED', stepLogs, memory, errorMessage);
    }
  }

  cancel(executionId: string): void {
    this.cancelledExecutions.add(executionId);
    const controller = this.abortControllers.get(executionId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(executionId);
    }
    logger.info(`[Orchestrator] Cancellation requested for execution ${executionId}`);
  }

  // ══════════════════════════════════════════════════════════════
  // ██ DYNAMIC HYBRID MODE
  // ══════════════════════════════════════════════════════════════
  private async executeDynamic(
    executionId: string,
    workflowId: string,
    nodes: WorkflowNode[],
    orchestratorNode: WorkflowNode,
    memory: SharedMemory,
    stepLogs: AgentStepLog[]
  ) {
    const MAX_LOOPS = 12;
    let loopCount = 0;

    // Remove Orchestrator from available payload agents to prevent it from calling itself
    const availableAgents = nodes.filter(n => n.id !== orchestratorNode.id);

    // Initial payload sent to Orchestrator
    let currentPayloadToOrch = JSON.stringify({
      source: "User",
      topic: memory.userInput
    });

    while (loopCount < MAX_LOOPS) {
      loopCount++;
      logger.info(`[Dynamic Orchestrator] Loop ${loopCount} starting...`);
      if (this.cancelledExecutions.has(executionId)) throw new Error('Execution stopped by user');

      // 1. Execute Orchestrator
      const isFirstLoop = loopCount === 1;
      const availableAgentNames = availableAgents.map(a => a.data.label).join(', ');
      
      let orchPrompt = `AVAILABLE AGENTS TO ROUTE TO: [${availableAgentNames}]\n\nIncoming payload to evaluate:\n\n${currentPayloadToOrch}`;
      if (isFirstLoop) {
         orchPrompt += `\n\nYOUR TASK: This is the initial topic from the User. You must start the workflow by choosing the best first agent (typically Researcher). Output your exact MANDATORY format.\nUse the EXACT JSON format below at the end of your response to forward the content:\n` +
         `\`\`\`json\n{\n  "next_agent": "AgentName",\n  "content": "Topic Prompt forwarded for you to work on: ..."\n}\n\`\`\``;
      } else {
         orchPrompt += `\n\nYOUR TASK: Review the agent's output above. If it needs revision, set needs_revision=true and revision_to="AgentName". If it's good, set next_agent="NextAgentName". If the workflow is completely finished, set next_agent=null.\nOutput your MUST-HAVE format.`;
      }

      const orchResponse = await this.executeAgent(
        executionId, workflowId, orchestratorNode, 
        orchPrompt, 
        memory, stepLogs
      );

      const { status, forwardContent } = extractOrchestratorContent(orchResponse);
      const parsedForward = parseAgentOutput(forwardContent);

      // 2. Determine Next Agent Target
      let targetAgentName: string | null = null;
      let targetPayload = forwardContent;

      if (parsedForward.needs_revision && parsedForward.revision_to && parsedForward.revision_to !== 'none' && parsedForward.revision_to !== 'null') {
        targetAgentName = parsedForward.revision_to;
        targetPayload = `⚠️ REVISION REQUEST FROM ORCHESTRATOR:\n${status}\n\nYour previous output:\n${forwardContent}`;
      } else if (parsedForward.next_agent && parsedForward.next_agent !== 'none' && parsedForward.next_agent !== 'null') {
        targetAgentName = parsedForward.next_agent;
      }

      // If Orchestrator failed to format JSON, fallback to starting with Researcher
      if (!targetAgentName && loopCount === 1) {
        targetAgentName = availableAgents.find(a => a.data.role.toLowerCase() === 'researcher')?.data.label || availableAgents[0]?.data.label;
      }

      // 3. Stop Condition
      if (!targetAgentName || targetAgentName.toLowerCase() === 'none' || targetAgentName === 'null') {
        logger.info('[Dynamic Orchestrator] Workflow fully completed (no target agent).');
        break;
      }

      const targetAgentNode = availableAgents.find(a => a.data.label.toLowerCase() === targetAgentName!.toLowerCase());
      if (!targetAgentNode) {
        logger.warn(`[Dynamic Orchestrator] Output targeted unknown agent: ${targetAgentName}. Stopping.`);
        break;
      }

      // 4. Execute Target Agent
      logger.info(`[Dynamic Orchestrator] Routing to: ${targetAgentNode.data.label}`);
      if (this.cancelledExecutions.has(executionId)) throw new Error('Execution stopped by user');

      const agentResponse = await this.executeAgent(
        executionId, workflowId, targetAgentNode, 
        `Please fulfill your task.\n\nORCHESTRATOR DIRECTIVE & PAYLOAD:\n${targetPayload}`, 
        memory, stepLogs
      );

      // 5. Feed agent response back to Orchestrator for the next loop
      currentPayloadToOrch = agentResponse;
    }

    if (loopCount >= MAX_LOOPS) {
      logger.warn('[Dynamic Orchestrator] Max loops reached! Forcing workflow stop.');
    }
  }

  // ══════════════════════════════════════════════════════════════
  // ██ HYBRID SUPERVISOR MODE
  // ══════════════════════════════════════════════════════════════
  private async executeHybridSupervisor(
    executionId: string,
    workflowId: string,
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    orchestratorNode: WorkflowNode,
    memory: SharedMemory,
    stepLogs: AgentStepLog[]
  ) {
    const MAX_FEEDBACK_ROUNDS = 3;
    const executionLevels = this.buildExecutionLevels(nodes, edges);
    // Remove Orchestrator from the main linear sequence so it only acts as a supervisor
    const executionSequence = executionLevels.flat().filter(n => n.id !== orchestratorNode.id);
    
    let workingContent = memory.userInput;
    let previousNode: WorkflowNode | null = null;
    let previousAgentContent = memory.userInput;

    for (const node of executionSequence) {
      if (this.cancelledExecutions.has(executionId)) throw new Error('Execution stopped by user');

      logger.info(`[Hybrid] Executing Agent: ${node.data.label}`);
      
      const payloadContext = `--- ORIGINAL USER DIRECTIVE ---\n${memory.userInput}\n\n--- CONTENT PRODUCED BY PREVIOUS AGENT (You must process this) ---\n${workingContent}`;

      let agentResponse = await this.executeAgent(
        executionId, workflowId, node, 
        `Please execute your specific role.\n\n${payloadContext}`, 
        memory, stepLogs
      );

      let parsedAgent = parseAgentOutput(agentResponse);

      // ── FEEDBACK LOOP TRIGGER ──
      if (parsedAgent.needs_revision && previousNode) {
        let round = 0;
        logger.info(`[Hybrid] 🛑 REVISION TRIGGERED: ${node.data.label} rejected ${previousNode.data.label}'s output!`);

        while (round < MAX_FEEDBACK_ROUNDS && parsedAgent.needs_revision) {
          round++;
          logger.info(`[Hybrid] Feedback Loop Round ${round}...`);
          if (this.cancelledExecutions.has(executionId)) throw new Error('Execution stopped by user');

          // 1. Orchestrator Criticizes Previous Node
          const orchPrompt = `HYBRID SUPERVISOR MODE\n\n--- ORIGINAL GOAL ---\n${memory.userInput}\n\nAgent [${node.data.label}] rejected the work of Agent [${previousNode.data.label}].\n\nCOMPLAINT FROM ${node.data.label}:\n${parsedAgent.final_output || agentResponse}\n\nORIGINAL WORK FROM ${previousNode.data.label}:\n${previousAgentContent}\n\nYOUR TASK: You are the Orchestrator Supervisor. Review the complaint against the ORIGINAL GOAL. Write a harsh, specific criticism and actionable directives for [${previousNode.data.label}] to fix their work. Do not output routing JSON, just the feedback text.`;
          
          const orchFeedback = await this.executeAgent(executionId, workflowId, orchestratorNode, orchPrompt, memory, stepLogs);

          // 2. Previous Node Redoes Work
          if (this.cancelledExecutions.has(executionId)) throw new Error('Execution stopped by user');
          const redoPrompt = `⚠️ YOUR PREVIOUS WORK WAS REJECTED BY ${node.data.label}!\n\n--- ORIGINAL GOAL ---\n${memory.userInput}\n\nCOMPLAINT:\n${parsedAgent.final_output || agentResponse}\n\nDIRECTIVE FROM ORCHESTRATOR SUPERVISOR:\n${orchFeedback}\n\nYOUR TASK: You must completely redo your work based on this feedback, making sure you align perfectly with the ORIGINAL GOAL. Output your standard JSON.`;
          
          const redoResponse = await this.executeAgent(executionId, workflowId, previousNode, redoPrompt, memory, stepLogs);
          const parsedRedo = parseAgentOutput(redoResponse);
          previousAgentContent = parsedRedo.final_output;

          // 3. Current Node Re-Evaluates
          if (this.cancelledExecutions.has(executionId)) throw new Error('Execution stopped by user');
          const reEvalPrompt = `--- ORIGINAL USER DIRECTIVE ---\n${memory.userInput}\n\nAgent [${previousNode.data.label}] has revised their work based on your feedback.\n\nREVISED WORK:\n${parsedRedo.final_output}\n\nYOUR TASK: Re-evaluate this new work according to your role's standards and the ORIGINAL GOAL. If it's good, set "needs_revision": false. If it still fails, set "needs_revision": true and provide a new complaint. Output your standard JSON.`;
          
          agentResponse = await this.executeAgent(executionId, workflowId, node, reEvalPrompt, memory, stepLogs);
          parsedAgent = parseAgentOutput(agentResponse);
        }

        if (round >= MAX_FEEDBACK_ROUNDS && parsedAgent.needs_revision) {
          logger.warn(`[Hybrid] Max feedback rounds (${MAX_FEEDBACK_ROUNDS}) reached. Forcing workflow progression.`);
        }
      }

      workingContent = parsedAgent.final_output;
      previousAgentContent = parsedAgent.final_output;
      previousNode = node;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // ██ WATERFALL LINEAR MODE
  // ══════════════════════════════════════════════════════════════
  private async executeWaterfall(
    executionId: string,
    workflowId: string,
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    memory: SharedMemory,
    stepLogs: AgentStepLog[]
  ) {
    const executionLevels = this.buildExecutionLevels(nodes, edges);
    const executionSequence = executionLevels.flat();
    
    let workingContent = memory.userInput;

    for (const node of executionSequence) {
      if (this.cancelledExecutions.has(executionId)) throw new Error('Execution stopped by user');

      logger.info(`[Waterfall] Executing Agent: ${node.data.label}`);
      
      const payloadContext = `--- ORIGINAL USER DIRECTIVE ---\n${memory.userInput}\n\n--- CONTENT PRODUCED BY PREVIOUS AGENT (You must process this) ---\n${workingContent}`;

      const agentResponse = await this.executeAgent(
        executionId, workflowId, node, 
        `Please execute your specific role.\n\n${payloadContext}`, 
        memory, stepLogs
      );

      // Extract JSON content to pass down the waterfall cleanly, or pass raw if JSON invalid
      const parsedAgent = parseAgentOutput(agentResponse);
      workingContent = parsedAgent.final_output;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // ██ BASE: EXECUTE SINGLE AGENT
  // ══════════════════════════════════════════════════════════════
  private async executeAgent(
    executionId: string,
    workflowId: string,
    node: WorkflowNode,
    currentTaskInput: string,
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
      input: currentTaskInput,
      output: '',
      startedAt: new Date().toISOString(),
    };

    try {
      const messages: ChatMessage[] = [];
      const systemPrompt = data.systemPrompt || `You are a ${data.role} agent.\n\nReturn JSON strictly.`;
      
      messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: currentTaskInput });

      // Save initial running state
      stepLogs.push(stepLog);
      await this.saveProgress(executionId, stepLogs);

      this.io.to(`workflow:${workflowId}`).emit('agentStarted', {
        executionId,
        nodeId: node.id,
        agentName: data.label,
        role: data.role,
        provider: data.provider,
        model: data.model,
        timestamp: new Date().toISOString(),
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      let fullOutput = memory.language === 'vi' ? 'Đang tải model (tốn 1-2 phút) và suy nghĩ...\n\n' : 'Loading model and thinking deeply...\n\n';
      this.io.to(`workflow:${workflowId}`).emit('agentStream', {
        executionId,
        nodeId: node.id,
        agentName: data.label,
        chunk: fullOutput,
        fullOutput,
        timestamp: new Date().toISOString(),
      });

      const provider = getAIProvider(data.provider);
      let isFirstChunk = true;
      const maxTokens = data.maxTokens ?? 8192;

      const abortController = new AbortController();
      this.abortControllers.set(executionId, abortController);

      if (this.cancelledExecutions.has(executionId)) throw new Error('Execution stopped by user');

      for await (const chunk of provider.chatStream({
        model: data.model,
        messages,
        temperature: data.temperature ?? 0.7,
        maxTokens,
        signal: abortController.signal,
      })) {
        if (isFirstChunk) {
          fullOutput = '';
          isFirstChunk = false;
        }

        fullOutput += chunk;

        this.io.to(`workflow:${workflowId}`).emit('agentStream', {
          executionId,
          nodeId: node.id,
          agentName: data.label,
          chunk,
          fullOutput,
          timestamp: new Date().toISOString(),
        });
      }

      memory.agentOutputs[node.id] = fullOutput;
      memory.conversationHistory.push({ role: 'user', content: `[${data.label}] executed task.` });
      memory.conversationHistory.push({ role: 'assistant', content: fullOutput });

      const durationMs = Date.now() - startTime;
      stepLog.status = 'completed';
      stepLog.output = fullOutput;
      stepLog.completedAt = new Date().toISOString();
      stepLog.durationMs = durationMs;
      await this.saveProgress(executionId, stepLogs);

      this.io.to(`workflow:${workflowId}`).emit('agentFinished', {
        executionId,
        nodeId: node.id,
        agentName: data.label,
        role: data.role,
        output: fullOutput,
        durationMs,
        timestamp: new Date().toISOString(),
      });

      this.abortControllers.delete(executionId);
      logger.info(`[Orchestrator] Agent "${data.label}" completed in ${durationMs}ms`);
      return fullOutput;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      stepLog.status = 'failed';
      stepLog.error = errorMessage;
      stepLog.completedAt = new Date().toISOString();
      stepLog.durationMs = Date.now() - startTime;
      await this.saveProgress(executionId, stepLogs);

      this.io.to(`workflow:${workflowId}`).emit('executionError', {
        executionId,
        nodeId: node.id,
        error: errorMessage,
      });

      this.abortControllers.delete(executionId);
      logger.error(`[Orchestrator] Agent "${data.label}" failed: ${errorMessage}`);
      throw error;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // ██ UTILITIES
  // ══════════════════════════════════════════════════════════════
  private buildExecutionLevels(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[][] {
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
            if (neighborNode) nextLevel.push(neighborNode);
          }
        }
      }
      currentLevel = nextLevel;
    }

    return levels;
  }

  private async getWorkflowId(executionId: string): Promise<string> {
    const execution = await prisma.execution.findUnique({
      where: { id: executionId },
      select: { workflowId: true },
    });
    if (!execution) throw new Error(`Execution ${executionId} not found`);
    return execution.workflowId;
  }

  private async updateExecutionStatus(
    executionId: string,
    status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED',
    workflowId: string,
  ) {
    const data: Record<string, unknown> = { status };
    if (status === 'RUNNING') data.startedAt = new Date();
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(status)) data.completedAt = new Date();

    await prisma.execution.update({ where: { id: executionId }, data });

    this.io.to(`workflow:${workflowId}`).emit(ServerEvents.EXECUTION_STATUS, {
      executionId, status, timestamp: new Date().toISOString(),
    });
  }

  private async saveProgress(executionId: string, stepLogs: AgentStepLog[]) {
    try {
      await prisma.execution.update({
        where: { id: executionId },
        data: { logs: JSON.parse(JSON.stringify(stepLogs)) }
      });
    } catch (e) {
      logger.error(`[Orchestrator] Failed to save early progress for ${executionId}:`, e);
    }
  }

  private async finalizeExecution(
    executionId: string,
    workflowId: string,
    status: 'COMPLETED' | 'FAILED' | 'CANCELLED',
    stepLogs: AgentStepLog[],
    memory: SharedMemory,
    errorMessage?: string,
  ) {
    const allOutputs = Object.values(memory.agentOutputs);
    const finalOutput = allOutputs.length > 0 ? allOutputs[allOutputs.length - 1] : '';

    const result: Record<string, unknown> = {
      output: finalOutput,
      allAgentOutputs: memory.agentOutputs,
      variables: memory.variables,
      conversationHistory: memory.conversationHistory,
    };
    if (errorMessage) result.error = errorMessage;

    const execution = await prisma.execution.update({
      where: { id: executionId },
      data: {
        status,
        result: JSON.parse(JSON.stringify(result)),
        logs: JSON.parse(JSON.stringify(stepLogs)),
        completedAt: new Date(),
      },
    });

    this.io.to(`workflow:${workflowId}`).emit(ServerEvents.EXECUTION_STATUS, {
      executionId, status, result, timestamp: new Date().toISOString(),
    });

    return execution;
  }
}

export default Orchestrator;
