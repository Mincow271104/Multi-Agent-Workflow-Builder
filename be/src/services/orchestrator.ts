import { Server as SocketIOServer } from 'socket.io';
import prisma from '../config/db';
import { logger } from '../utils';
import { ServerEvents } from '../models/types';
import { getAIProvider, type ProviderName, type ChatMessage } from './aiProviders';
import { parseAgentOutput, parseOrchestratorPlan, parseAgentReflection } from './agentOutputParser';

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
    const availableAgents = nodes.filter(n => n.id !== orchestratorNode.id);
    if (availableAgents.length === 0) {
      logger.warn('[Dynamic Orchestrator] No available agents to execute.');
      return;
    }

    const availableAgentNames = availableAgents.map(a => `"${a.data.label}" (Role: ${a.data.role || 'General'})`).join(', ');

    // ── PHASE 1: Orchestrator Path Planning ──
    logger.info(`[Dynamic Orchestrator] Phase 1 - Planning Sequence`);
    const planPrompt = `USER DIRECTIVE: ${memory.userInput}\n\nAVAILABLE AGENTS: [${availableAgentNames}]\n\nYOUR TASK: You are the Chief Orchestrator. Break down the USER DIRECTIVE into distinct chronological steps. Assign EACH step to the most appropriate agent from the AVAILABLE AGENTS list.\n\nCRITICAL RULES:\n1. You MUST use as many different available agents as necessary. Do not overload one agent with multiple distinct roles (e.g., if writing and translating are needed, assign Writer then Translator).\n2. For each agent, you MUST define a strict "taskScoping" instruction. Tell them exactly what their isolated sub-task is. End it with explicit boundary warnings like "Do not do X. Leave X for the next agent."\n\nYou MUST respond with EXACTLY this JSON format and nothing else:\n\`\`\`json\n{\n  "thoughts": "Step 1 is X -> assigned to A. Step 2 is Y -> assigned to B...",\n  "plan": [\n    {\n      "agentName": "Exact Name of the Agent in quotes (DO NOT write the Role here)",\n      "taskScoping": "Your specific task is X. Do NOT do Y. Leave Y for the next agent."\n    }\n  ]\n}\n\`\`\``;

    const orchResponse = await this.executeAgent(
      executionId, workflowId, orchestratorNode,
      planPrompt,
      memory, stepLogs
    );

    let dynamicPlan = parseOrchestratorPlan(orchResponse);

    if (!dynamicPlan || dynamicPlan.length === 0) {
      logger.warn('[Dynamic Orchestrator] Failed to parse a valid plan from Orchestrator. Falling back to all agents.');
      dynamicPlan = availableAgents.map(a => ({ agentName: a.data.label, taskScoping: 'Please execute your specific role.' }));
    }
    
    // Map names back to actual Node objects
    const executionSequence: { node: WorkflowNode; taskScoping: string }[] = dynamicPlan
      .map(step => {
         const node = availableAgents.find(a => a.data.label.toLowerCase() === step.agentName.toLowerCase());
         return node ? { node, taskScoping: step.taskScoping } : undefined;
      })
      .filter((n): n is { node: WorkflowNode; taskScoping: string } => n !== undefined);

    if (executionSequence.length === 0) {
      logger.warn('[Dynamic Orchestrator] Plan resulted in no matched agents. Aborting.');
      return;
    }

    logger.info(`[Dynamic Orchestrator] Plan established: ${executionSequence.map(a => a.node.data.label).join(' -> ')}`);

    // ── PHASE 2: State Machine Ping-Pong Execution ──
    let currentStepIndex = 0;
    const MAX_REVISIONS = 5;
    let revisionsCount = 0;
    let globalRunCounter = 0; // Monotonic counter for unique UI instance IDs
    
    let workingContent = memory.userInput;
    let currentFeedback = '';

    while (currentStepIndex < executionSequence.length) {
      if (this.cancelledExecutions.has(executionId)) throw new Error('Execution stopped by user');
      
      const isFirstAgent = currentStepIndex === 0;
      const { node: agentNode, taskScoping } = executionSequence[currentStepIndex];
      const previousAgentNode = currentStepIndex > 0 ? executionSequence[currentStepIndex - 1].node : null;

      logger.info(`[Dynamic Orchestrator] Executing Agent at Step ${currentStepIndex} (${agentNode.data.label})`);

      let agentPrompt = '';
      if (isFirstAgent) {
        agentPrompt = `--- YOUR STRICT TASK SCOPING ---\n${taskScoping || 'Please fulfill your role based on the directive.'}\n\n`;
        if (currentFeedback) {
           agentPrompt += `⚠️ MESSAGE FROM ORCHESTRATOR:\n${currentFeedback}\n\nPlease revise your work accordingly.`;
        }
        agentPrompt += `\n\nSince you are the first agent, output ONLY your final result as plain text without any JSON envelope. YOU MUST OBEY YOUR STRICT TASK SCOPING ABOVE. Do NOT attempt to fulfill the entire Original User Directive.\nCRITICAL: You MUST NOT perform tasks explicitly assigned to OTHER agents (e.g., do NOT translate if a Translator agent exists, do NOT do SEO if an SEO agent exists).\n\nCRITICAL LANGUAGE RULE: Your output MUST be in English unless your task explicitly commands otherwise.`;
      } else {
        agentPrompt = `--- YOUR STRICT TASK SCOPING ---\n${taskScoping || 'Please perform your role on the previous output.'}\n\n`;
        agentPrompt += `--- OUTPUT FROM PREVIOUS AGENT (${previousAgentNode?.data.label}) ---\n${workingContent}\n\n`;
        
        if (currentFeedback) {
           agentPrompt += `⚠️ MESSAGE FROM ORCHESTRATOR:\n${currentFeedback}\n\nPlease revise your work.\n\n`;
        }

        agentPrompt += `YOUR PRIMARY JOB: You MUST perform your STRICT TASK SCOPING on the content above. Read your task scoping carefully and TRANSFORM the content accordingly. Simply copy-pasting the previous content without modification is NOT acceptable — you will fail your task if you do so.\n\nAfter completing your transformation, set your status:\n- APPROVED: The previous content was usable AND your transformation is complete.\n- REJECTED: The previous content is fundamentally broken and cannot be used. Provide specific feedback.\n\nRULES:\n1. You MUST NOT perform tasks assigned to OTHER agents (e.g., do NOT translate if a Translator agent exists, do NOT do SEO if an SEO agent exists). Only do YOUR scoped task.\n2. Do NOT critique missing elements scoped for LATER agents (e.g., missing emojis, missing translation). Only judge YOUR scope.\n3. Your internal thinking MUST be in English. ONLY translate content if your taskScoping explicitly commands it.\n\nYou MUST respond at the end of your message with exactly this JSON format:\n\`\`\`json\n{\n  "status": "APPROVED" | "REJECTED",\n  "feedback": "Brief note on what you did or why you rejected.",\n  "content": "The TRANSFORMED content after you performed your task. This MUST be different from the input if your task requires modification. Do NOT leave empty."\n}\n\`\`\``;
      }

      const stepInstanceId = `${agentNode.id}-inst-${globalRunCounter++}`;

      const agentResponse = await this.executeAgent(
        executionId, workflowId, agentNode,
        agentPrompt,
        memory, stepLogs, stepInstanceId
      );

      if (isFirstAgent) {
        workingContent = agentResponse;
        currentFeedback = '';
        currentStepIndex++;
      } else {
        const reflection = parseAgentReflection(agentResponse);
        
        if (reflection.status === 'REJECTED') {
           logger.info(`[Dynamic Orchestrator] ${agentNode.data.label} REJECTED output. Asking Orchestrator to review...`);
           
           const orchReviewPrompt = `--- ORCHESTRATOR OVERSIGHT REQUIRED ---\n\nAgent "${agentNode.data.label}" just REJECTED the output of Agent "${previousAgentNode?.data.label}".\n\nHere is the critique from "${agentNode.data.label}":\n"${reflection.feedback}"\n\nYOUR TASK: As the overall Orchestrator, review this feedback. Write a clear, encouraging, but strict directive addressed to "${previousAgentNode?.data.label}" explaining exactly what they need to fix based on this feedback. Output ONLY your message to them, without any JSON formatting.`;
           
           const orchReviewInstanceId = `${orchestratorNode.id}-review-${globalRunCounter++}`;
           const orchReview = await this.executeAgent(
             executionId, workflowId, orchestratorNode,
             orchReviewPrompt,
             memory, stepLogs, orchReviewInstanceId
           );

           revisionsCount++;
           
           if (revisionsCount >= MAX_REVISIONS) {
             logger.warn(`[Dynamic Orchestrator] Max revisions (${MAX_REVISIONS}) reached. Force Approving to prevent infinite loop.`);
             workingContent = agentResponse;
             currentFeedback = '';
             revisionsCount = 0; // VITAL: Reset so next agents get their own 5 tries
             currentStepIndex++;
           } else {
             // Bounce back with feedback synthesized by Orchestrator
             currentFeedback = orchReview;
             currentStepIndex--;
           }
        } else {
           logger.info(`[Dynamic Orchestrator] ${agentNode.data.label} APPROVED output.`);
           if (reflection.content && reflection.content.trim()) {
             workingContent = reflection.content;
           } else {
             // Safety net: agent left content empty despite instructions. Retain previous workingContent.
             logger.warn(`[Dynamic Orchestrator] ${agentNode.data.label} returned empty content. Retaining previous workingContent as safety fallback.`);
           }
           currentFeedback = '';
           revisionsCount = 0; // Reset for next agent
           currentStepIndex++;
        }
      }
    }
    
    // ── PHASE 3: Final Orchestrator Review ──
    logger.info(`[Dynamic Orchestrator] Sequence complete. Handing over to Orchestrator for FINAL REVIEW.`);
    const finalReviewPrompt = `--- FINAL ORCHESTRATOR REVIEW ---\n\nORIGINAL DIRECTIVE:\n${memory.userInput}\n\nFINAL OUTPUT FROM LAST AGENT:\n${workingContent}\n\nYOUR TASK: You are the Orchestrator. The workflow has completed its routing sequence. Please review the final output against the original directive. If it needs final polish, formatting, or a concluding summary, provide it now.\n\nCRITICAL RULES:\n1. DO NOT TRANSLATE. Output the content in the EXACT SAME LANGUAGE as the FINAL OUTPUT above.\n2. DO NOT include any headers, status blocks, or conversational padding such as "=== ORCHESTRATOR STATUS ===", "Message to user:", "Current stage:", "Next action:", or "=== END STATUS ===".\n3. Output ONLY the raw final content as plain text. No JSON envelope.`;

    const finalOrchInstanceId = `${orchestratorNode.id}-final-${globalRunCounter++}`;
    const finalResult = await this.executeAgent(
      executionId, workflowId, orchestratorNode,
      finalReviewPrompt,
      memory, stepLogs, finalOrchInstanceId
    );

    logger.info(`[Dynamic Orchestrator] Workflow completed successfully.`);
    return finalResult;
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
    const MAX_REVISIONS = 5;
    const executionLevels = this.buildExecutionLevels(nodes, edges);
    // Remove Orchestrator from the main linear sequence so it only acts as a supervisor
    const executionSequence = executionLevels.flat().filter(n => n.id !== orchestratorNode.id);
    
    let workingContent = memory.userInput;
    let currentFeedback = '';

    let currentStepIndex = 0;
    let revisionsCount = 0;

    while (currentStepIndex < executionSequence.length) {
      if (this.cancelledExecutions.has(executionId)) throw new Error('Execution stopped by user');

      const node = executionSequence[currentStepIndex];
      logger.info(`[Hybrid] Executing Agent at Step ${currentStepIndex}: ${node.data.label}`);

      // 1. Agent Executes
      let agentPrompt = `--- ORIGINAL DIRECTIVE ---\n${memory.userInput}\n\n--- WORKING CONTENT ---\n${workingContent}\n\n`;
      if (currentFeedback) {
        agentPrompt += `⚠️ MESSAGE FROM ORCHESTRATOR:\n${currentFeedback}\n\nPlease revise your work.\n\n`;
      } else {
        agentPrompt += `Please execute your specific role on the Working Content.\n\n`;
      }
      agentPrompt += `Output your final result as plain text without any JSON envelope.`;

      const agentResponse = await this.executeAgent(
        executionId, workflowId, node, 
        agentPrompt, 
        memory, stepLogs
      );

      // 2. Orchestrator Evaluates
      logger.info(`[Hybrid] Orchestrator Evaluating Agent ${node.data.label}...`);
      if (this.cancelledExecutions.has(executionId)) throw new Error('Execution stopped by user');

      const evaluationPrompt = `--- HYBRID SUPERVISOR EVALUATION ---\n\nORIGINAL DIRECTIVE:\n${memory.userInput}\n\nAGENT (${node.data.label}) JUST PRODUCED:\n${agentResponse}\n\nYOUR TASK: You are the strict Orchestrator routing the workflow. Evaluate the Agent's output against the Original Directive.\nIf it is poor, incorrect, or incomplete, REJECT it and provide feedback describing what they must fix.\nIf it is acceptable, APPROVE it to pass down the workflow.\n\nYou MUST respond at the end of your message with exactly this JSON format:\n\`\`\`json\n{\n  "status": "APPROVED" | "REJECTED",\n  "feedback": "Reason for rejection or brief note if approved.",\n  "content": "Your final processed output or revised text if approved (leave empty if rejected)"\n}\n\`\`\``;

      const evalResponse = await this.executeAgent(
        executionId, workflowId, orchestratorNode,
        evaluationPrompt,
        memory, stepLogs
      );

      const reflection = parseAgentReflection(evalResponse);

      if (reflection.status === 'REJECTED') {
         logger.info(`[Hybrid] 🛑 Orchestrator REJECTED ${node.data.label}'s output. Forcing rewrite...`);
         revisionsCount++;
         
         if (revisionsCount >= MAX_REVISIONS) {
           logger.warn(`[Hybrid] Max revisions (${MAX_REVISIONS}) reached. Force advancing.`);
           workingContent = agentResponse;
           currentFeedback = '';
           currentStepIndex++;
         } else {
           // Provide Orchestrator feedback and repeat the same index
           currentFeedback = reflection.feedback || "Your output was inadequate. Please redo.";
         }
      } else {
         logger.info(`[Hybrid] ✅ Orchestrator APPROVED ${node.data.label}'s output.`);
         workingContent = reflection.content && reflection.content.trim() ? reflection.content : agentResponse;
         currentFeedback = '';
         revisionsCount = 0; // Reset for the next agent
         currentStepIndex++;
      }
    }

    // ── PHASE 3: Final Orchestrator Review ──
    logger.info(`[Hybrid] Sequence complete. Handing over to Orchestrator for FINAL REVIEW.`);
    const finalReviewPrompt = `--- FINAL ORCHESTRATOR REVIEW ---\n\nORIGINAL DIRECTIVE:\n${memory.userInput}\n\nFINAL OUTPUT FROM LAST AGENT:\n${workingContent}\n\nYOUR TASK: You are the Orchestrator. The workflow has completed its routing sequence. Please review the final output against the original directive. If it needs final polish, formatting, or a concluding summary, provide it now. \n\nOutput your final response as plain text without any JSON envelope.`;

    const finalResult = await this.executeAgent(
      executionId, workflowId, orchestratorNode,
      finalReviewPrompt,
      memory, stepLogs
    );

    logger.info(`[Hybrid] Workflow completed successfully.`);
    return finalResult;
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
    stepInstanceId?: string
  ): Promise<string> {
    const startTime = Date.now();
    const { data } = node;

    const stepLog: AgentStepLog = {
      nodeId: stepInstanceId || node.id,
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
      // Strip conflicting OUTPUT FORMAT from system prompt (injected by auto-gen).
      // The orchestrator's dynamic prompt already provides the correct format instructions.
      const rawPrompt = data.systemPrompt || `You are a ${data.role} agent.`;
      const systemPrompt = rawPrompt.replace(/OUTPUT FORMAT:[\s\S]*/i, '').trim();
      
      messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: currentTaskInput });

      // Save initial running state
      stepLogs.push(stepLog);
      await this.saveProgress(executionId, stepLogs);

      this.io.to(`workflow:${workflowId}`).emit('agentStarted', {
        executionId,
        nodeId: stepInstanceId || node.id,
        originalNodeId: node.id,
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
        nodeId: stepInstanceId || node.id,
        originalNodeId: node.id,
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
          nodeId: stepInstanceId || node.id,
          originalNodeId: node.id,
          agentName: data.label,
          chunk,
          fullOutput,
          timestamp: new Date().toISOString(),
        });
      }

      memory.agentOutputs[stepInstanceId || node.id] = fullOutput;

      const durationMs = Date.now() - startTime;
      stepLog.status = 'completed';
      stepLog.output = fullOutput;
      stepLog.completedAt = new Date().toISOString();
      stepLog.durationMs = durationMs;
      await this.saveProgress(executionId, stepLogs);

      this.io.to(`workflow:${workflowId}`).emit('agentFinished', {
        executionId,
        nodeId: stepInstanceId || node.id,
        originalNodeId: node.id,
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
        nodeId: stepInstanceId || node.id,
        originalNodeId: node.id,
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
