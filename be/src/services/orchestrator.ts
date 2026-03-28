// ===================================================================
// Orchestrator — Core Multi-Agent Workflow Execution Engine
// ===================================================================
//
// This module takes a workflow definition (React Flow format: nodes +
// edges) and executes AI agents sequentially.
//
// KEY IMPROVEMENTS IN V2 (Deep Thinking + Language Mode):
//  1. Configurable Deep Thinking (CoT) — Enforces a structured 6-step 
//     Chain-of-Thought (Understand -> Breakdown -> Analyze -> Self-Critique -> Refine -> Synthesize).
//  2. Full Language Support — 'vi' (Vietnamese) or 'en' (English). 
//     Forces the entire CoT and final output into the specified language.
//  3. Focused Context Passing — We only pass the *final polished output*
//     of the previous agent forward, rather than flooding the next agent
//     with its predecessor's internal thinking steps.
//  4. Custom Agent Support — Ensures "Custom" nodes inherit full
//     Deep Thinking capabilities exactly like default roles.
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

// ─── Configuration — Deep Thinking ──────────────────────────────

export interface DeepThinkingConfig {
  /** If true, enables the 6-step CoT prompting for all agents */
  enabled: boolean;
  /** Max tokens allocated for the deep thinking process */
  maxTokens: number;
  /** Keyword used by the agent to demarcate the final polished output */
  finalOutputMarker: string;
}

const DEFAULT_DEEP_THINKING_CONFIG: DeepThinkingConfig = {
  enabled: true,
  maxTokens: 8192, // Generous limit for deep 6-step reasoning
  finalOutputMarker: '## Final Output', // The exact heading we instruct agents to use
};

// ─── Types — React Flow Workflow Format ─────────────────────────

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

// ─── Types — Execution Context ──────────────────────────────────

export interface SharedMemory {
  /** The initial prompt from the human user */
  userInput: string;
  /** The target language for the workflow ('vi' or 'en') */
  language: string;
  /** Stores the FULL output of each agent (including its thinking steps) */
  agentOutputs: Record<string, string>;
  variables: Record<string, unknown>;
  /** Complete historical log of the execution */
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

// ─── Orchestrator Class ─────────────────────────────────────────

export class Orchestrator {
  private io: SocketIOServer;
  private cancelledExecutions = new Set<string>();
  private abortControllers = new Map<string, AbortController>();

  constructor(io: SocketIOServer) {
    this.io = io;
  }

  // ══════════════════════════════════════════════════════════════
  // ██  PUBLIC — Main execute() method
  // ══════════════════════════════════════════════════════════════

  async execute(
    executionId: string,
    workflowConfig: WorkflowConfig,
    userInput: string,
    language: string = 'vi' // Default to Vietnamese if not specified
  ) {
    const { nodes, edges } = workflowConfig;
    const workflowId = await this.getWorkflowId(executionId);

    await this.updateExecutionStatus(executionId, 'RUNNING', workflowId);

    const executionLevels = this.buildExecutionLevels(nodes, edges);
    logger.info(`[Orchestrator] Execution ${executionId}: ${nodes.length} agents sequentially (Deep Thinking v2 | Lang: ${language})`);

    const memory: SharedMemory = {
      userInput,
      language,
      agentOutputs: {},
      variables: {},
      conversationHistory: [],
    };

    const stepLogs: AgentStepLog[] = [];

    try {
      for (let level = 0; level < executionLevels.length; level++) {
        const levelNodes = executionLevels[level];

        if (this.cancelledExecutions.has(executionId)) {
          logger.info(`[Orchestrator] Execution ${executionId} was cancelled.`);
          this.cancelledExecutions.delete(executionId);
          return this.finalizeExecution(executionId, workflowId, 'CANCELLED', stepLogs, memory);
        }

        // Strictly Sequential Execution within levels
        for (const node of levelNodes) {
           await this.executeAgent(executionId, workflowId, node, edges, memory, stepLogs);
        }
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
  // ██  PRIVATE — Execute a single agent node
  // ══════════════════════════════════════════════════════════════

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

      const isRoot = parentNodeIds.length === 0;

      // Extract *only* the refined final output from the previous agent
      // to keep the context clean and focused, preventing context degradation.
      let polishedPreviousOutput = '';
      if (!isRoot) {
        polishedPreviousOutput = parentNodeIds
          .filter((pid) => memory.agentOutputs[pid]) 
          .map((pid) => this.extractPolishedOutput(memory.agentOutputs[pid]))
          .join('\n\n---\n\n');
      }

      // ── 2. Build Memory Chain & Chat Messages ────────────────────
      const messages: ChatMessage[] = [];

      // A. Deep Thinking + Language System Prompt
      const systemPrompt = this.buildSystemPrompt(node, memory.language);
      messages.push({ role: 'system', content: systemPrompt });

      // B. Structure the task instruction
      let currentTaskInput = '';
      
      if (isRoot) {
        currentTaskInput = memory.language === 'vi' 
          ? `Đây là yêu cầu gốc từ người dùng:\n\n"${memory.userInput}"\n\nHãy thực hiện vai trò chuyên gia của bạn để giải quyết yêu cầu này theo đúng quy trình suy nghĩ sâu.`
          : `Here is your initial user task:\n\n"${memory.userInput}"\n\nPlease execute your specialized role to address this task following your deep thinking protocol.`;
      } else {
        if (memory.language === 'vi') {
          currentTaskInput = `Yêu cầu gốc từ người dùng: "${memory.userInput}"

Đây là ngữ cảnh/kết quả từ (các) bước trước:
=========================================
${polishedPreviousOutput}
=========================================

Nhiệm vụ của bạn:
Với vai trò ${data.role}, hãy thực hiện nhiệm vụ chuyên môn của bạn trên kết quả trên. 
QUY TẮC QUAN TRỌNG: KHÔNG ĐƯỢC sao chép hay lặp lại kết quả trước đó. Bạn phải phân tích nó thật sâu sắc theo đúng vai trò của mình. Trình bày suy nghĩ 6 bước trước, sau đó là kết quả cuối cùng đã được trau chuốt hoàn hảo.`;
        } else {
          currentTaskInput = `Original User Request: "${memory.userInput}"

Here is the context/output from the previous step(s):
=========================================
${polishedPreviousOutput}
=========================================

Your Task:
As a ${data.role}, perform your specialized task on the above output. 
CRITICAL RULE: DO NOT simply copy or repeat the previous output. You must analyze it deeply according to your role. Present your 6-step thinking first, then the polished final outcome.`;
        }
      }

      messages.push({ role: 'user', content: currentTaskInput });
      stepLog.input = currentTaskInput;

      // ── 3. Emit "agentStarted" event ───────────────────────────
      this.io.to(`workflow:${workflowId}`).emit('agentStarted', {
        executionId,
        nodeId: node.id,
        agentName: data.label,
        role: data.role,
        provider: data.provider,
        model: data.model,
        timestamp: new Date().toISOString(),
      });

      // Show an initial "Thinking deeply..." payload in the correct language
      let fullOutput = memory.language === 'vi' ? 'Đang suy nghĩ sâu...\n\n' : 'Thinking deeply...\n\n';
      this.io.to(`workflow:${workflowId}`).emit('agentStream', {
        executionId,
        nodeId: node.id,
        agentName: data.label,
        chunk: fullOutput,
        fullOutput,
        timestamp: new Date().toISOString(),
      });

      // ── 4. Stream AI response ───────────────────────────────────
      const provider = getAIProvider(data.provider);
      let isFirstChunk = true;
      const maxTokens = DEFAULT_DEEP_THINKING_CONFIG.enabled 
        ? DEFAULT_DEEP_THINKING_CONFIG.maxTokens 
        : (data.maxTokens ?? 2048);

      const abortController = new AbortController();
      this.abortControllers.set(executionId, abortController);

      if (this.cancelledExecutions.has(executionId)) {
        throw new Error('Execution stopped by user');
      }

      for await (const chunk of provider.chatStream({
        model: data.model,
        messages,
        temperature: data.temperature ?? 0.7,
        maxTokens,
        signal: abortController.signal,
      })) {
        if (isFirstChunk) {
          // Clear the placebo text once the real stream starts
          fullOutput = '';
          isFirstChunk = false;
        }

        fullOutput += chunk;

        // Emit 'agentStream'
        this.io.to(`workflow:${workflowId}`).emit('agentStream', {
          executionId,
          nodeId: node.id,
          agentName: data.label,
          chunk,
          fullOutput,
          timestamp: new Date().toISOString(),
        });
      }

      // ── 5. Store output in shared memory ────────────────────────
      memory.agentOutputs[node.id] = fullOutput;
      
      // Store the full context (including thoughts) in the database history
      memory.conversationHistory.push(
        { role: 'user', content: `[${data.role}] executed task.` },
        { role: 'assistant', content: fullOutput },
      );

      // ── 6. Complete the step log ────────────────────────────────
      const durationMs = Date.now() - startTime;
      stepLog.status = 'completed';
      stepLog.output = fullOutput;
      stepLog.completedAt = new Date().toISOString();
      stepLog.durationMs = durationMs;
      stepLogs.push(stepLog);

      // ── 7. Emit "agentFinished" event ─────────────────────────
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
      stepLogs.push(stepLog);

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
  // ██  PRIVATE — Graph Utilities & Helpers
  // ══════════════════════════════════════════════════════════════

  /**
   * Helper function that parses the output from the previous agent
   * and extracts ONLY the final answer (ignoring the CoT steps)
   * to provide clean context for the next agent.
   */
  private extractPolishedOutput(fullOutput: string): string {
    if (!DEFAULT_DEEP_THINKING_CONFIG.enabled) return fullOutput;

    // Use regex to find everything after the "## Final Output" heading (case-insensitive)
    const marker = DEFAULT_DEEP_THINKING_CONFIG.finalOutputMarker;
    const regex = new RegExp(`${marker}([\\s\\S]*)`, 'i');
    const match = fullOutput.match(regex);

    if (match && match[1]) {
      return match[1].trim();
    }
    
    // Fallback if the agent forgot to include the exact heading
    return fullOutput.trim();
  }

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

    const processedCount = levels.reduce((sum, lvl) => sum + lvl.length, 0);
    if (processedCount < nodes.length) {
      throw new Error(`Workflow contains a cycle.`);
    }

    return levels;
  }

  /**
   * Constructs the Deep Thinking v2 system prompt specifically tailored
   * for the given Node and selected Language. Support Custom Agents.
   */
  private buildSystemPrompt(node: WorkflowNode, language: string): string {
    const { role, systemPrompt: customPrompt, label } = node.data;
    let systemPromptText = '';

    // ── 0. Global Anti-Copy Enforcement ──
    systemPromptText += `TUYỆT ĐỐI KHÔNG COPY, LẶP LẠI, TÓM TẮT HOẶC DÙNG LẠI bất kỳ phần nào từ output của agent trước. Bạn phải suy nghĩ độc lập, sáng tạo hoàn toàn mới dựa trên insight chính. Suy nghĩ sâu, tự do, và đưa ra giá trị đóng góp tốt nhất cho workflow. Vi phạm quy tắc này sẽ bị coi là lỗi nghiêm trọng.\n\n`;

    // ── 1. Language Enforcement ──
    if (language === 'vi') {
      systemPromptText += `Bạn phải trả lời hoàn toàn bằng tiếng Việt. Toàn bộ suy nghĩ, phân tích và output cuối cùng phải bằng tiếng Việt.\n\n`;
    } else {
      systemPromptText += `You must respond entirely in English. All thinking, analysis and final output must be in English.\n\n`;
    }

    // ── 2. Deep Thinking v2 Rules ──
    if (DEFAULT_DEEP_THINKING_CONFIG.enabled) {
      const normalizedRole = role.toLowerCase().trim();
      const isDeeperCoT = normalizedRole === 'researcher' || normalizedRole === 'writer';
      
      if (language === 'vi') {
        const reasoningStyleVI = isDeeperCoT ? ` dài, cực kỳ chi tiết, phân tích sắc bén và lập luận sâu sắc nhất có thể.` : `.`;
        
        systemPromptText += `Bạn là một chuyên gia hàng đầu thế giới. Hãy suy nghĩ cực kỳ sâu sắc và thấu đáo. Sử dụng cách suy luận logic, thận trọng theo từng bước. Không được vội vàng. Phân tích mọi khía cạnh trước khi trả lời. Trình bày rõ ràng toàn bộ Chuỗi Suy Nghĩ (Chain-of-Thought) của bạn${reasoningStyleVI}

Trước khi đưa ra kết quả cuối cùng hoàn chỉnh, BẠN PHẢI thực hiện 7 bước suy nghĩ rõ ràng, sử dụng các tiêu đề cho từng bước:
- Bước 1: Hiểu rõ nhiệm vụ và kết quả của tác nhân trước đó
- Bước 2: Chia nhỏ vấn đề thành 4-6 câu hỏi phụ chi tiết
- Bước 3: Phân tích sâu sắc bằng lập luận, ví dụ và rủi ro tiềm ẩn
- Bước 4: Tự phản biện (tìm ra điểm yếu trong chính suy nghĩ của bạn)
- Bước 5: Tinh chỉnh và củng cố câu trả lời
- Bước 6: Đối chiếu chéo với các ví dụ chuẩn mực thực tế và tìm kiếm các mâu thuẫn tiềm ẩn
- Bước 7: Tổng hợp thành kết quả cuối cùng hoàn hảo

Chỉ sau khi hoàn thành 7 bước này, bạn mới xuất ra Kết Quả Cuối Cùng dưới một tiêu đề rõ ràng là "${DEFAULT_DEEP_THINKING_CONFIG.finalOutputMarker}".\n\n`;
      } else {
        const reasoningStyleEN = isDeeperCoT ? `, making it extremely long, highly analytical, and heavily detailed.` : `.`;
        
        systemPromptText += `You are a world-class expert. Think extremely deeply and thoroughly. Use slow, careful, step-by-step reasoning. Do not rush. Analyze every angle before answering. Show your full Chain-of-Thought clearly${reasoningStyleEN}

Before providing your final polished output, you MUST perform an explicit internal Chain-of-Thought (CoT) with the following 7 steps. Present your thinking clearly using headings for each step:
- Step 1: Fully understand the task + previous agent output
- Step 2: Break down into 4-6 detailed sub-questions
- Step 3: Deep analysis with reasoning, examples, and potential risks
- Step 4: Self-critique (find weaknesses in my own thinking)
- Step 5: Refine and improve the answer
- Step 6: Cross-check with real-world examples and potential contradictions
- Step 7: Synthesize into polished final output

Only after you have completed these 7 thinking steps should you output your Final Result under a clean "${DEFAULT_DEEP_THINKING_CONFIG.finalOutputMarker}" heading.\n\n`;
      }
    }

    // ── 3. Role/Custom Agent Context ──
    const normalizedRole = role.toLowerCase().trim();
    const isCustom = node.type === 'custom' || normalizedRole === 'custom' || normalizedRole === 'custom agent';

    if (isCustom) {
      if (language === 'vi') {
        systemPromptText += `Bạn đang hoạt động dưới vai trò một Tác Nhân Tùy Chỉnh có tên "${label}".
Vui lòng tuân thủ chặt chẽ các hướng dẫn chuyên môn sau đây:
-----------------------------------------
${customPrompt || 'Hãy thực hiện nhiệm vụ được yêu cầu một cách tốt nhất.'}
-----------------------------------------
Áp dụng quy trình suy nghĩ sâu của bạn vào các hướng dẫn này một cách xuất sắc.`;
      } else {
        systemPromptText += `You are operating as a Specialized Custom Agent titled "${label}".
Your specific role instructions are:
-----------------------------------------
${customPrompt || 'Perform the requested task to the best of your ability.'}
-----------------------------------------
Apply your deep thinking protocol perfectly to satisfy these custom instructions.`;
      }
    } else {
      // DEFAULT PRE-BUILT AGENTS
      const rolePromptsEN: Record<string, string> = {
        researcher: `You are a Deep Researcher agent. Conduct deep market analysis with real data, numbers, comparisons. Dive beyond surface-level facts.`,
        writer: `You are a Deep Writer agent. Engage in deep creative thinking: brainstorm multiple angles, select the absolute best one, justify your selection, and write a high-impact narrative.`,
        critic: `You are a Deep Critic agent. Engage in deep critical thinking: find hidden weaknesses, analyze psychological impacts, consider long-term effects, and tear down assumptions relentlessly.`,
        publisher: `You are a Deep Publisher agent. Perform deep optimization thinking: evaluate various publishing formats, choose the most viral/effective one, explicitly justify your choice, and format it perfectly.`,
      };

      const rolePromptsVI: Record<string, string> = {
        researcher: `Bạn là Tác nhân Nghiên Cứu Chuyên Sâu. Tiến hành phân tích thị trường sâu sắc với dữ liệu thực, con số, so sánh. Đi sâu hơn các sự thật bề nổi.`,
        writer: `Bạn là Tác nhân Viết lách Chuyên Sâu. Suy nghĩ sáng tạo sâu sắc: suy nghĩ về nhiều góc độ, chọn góc xuất sắc nhất, giải thích sự lựa chọn của bạn và viết ra cấu trúc kể chuyện gây ấn tượng mạnh.`,
        critic: `Bạn là Tác nhân Phê Bình Chuyên Sâu. Thực hiện tư duy phản biện: tìm ra các điểm yếu ẩn giấu, phân tích tác động tâm lý, xem xét ảnh hưởng lâu dài và phá vỡ các định kiến.`,
        publisher: `Bạn là Tác nhân Xuất Bản Chuyên Sâu. Tối ưu hóa sâu sắc: đánh giá các định dạng xuất bản khác nhau, chọn định dạng có khả năng viral/hiệu quả nhất, biện minh rõ ràng cho sự lựa chọn của bạn và định dạng nó một cách hoàn hảo.`,
      };

      if (language === 'vi') {
        systemPromptText += rolePromptsVI[normalizedRole] || `Bạn là một tác nhân ${role}. Hãy thực hiện tốt chức năng của mình vào ngữ cảnh nhiệm vụ bằng tư duy sâu.`;
      } else {
        systemPromptText += rolePromptsEN[normalizedRole] || `You are a ${role} agent. Apply your role effectively to the task context using deep thinking.`;
      }
    }

    return systemPromptText;
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

  private async finalizeExecution(
    executionId: string,
    workflowId: string,
    status: 'COMPLETED' | 'FAILED' | 'CANCELLED',
    stepLogs: AgentStepLog[],
    memory: SharedMemory,
    errorMessage?: string,
  ) {
    const allOutputs = Object.values(memory.agentOutputs);
    // For the final execution result payload, store the raw output here so we don't lose the CoT trace
    const finalOutput = allOutputs.length > 0 ? allOutputs[allOutputs.length - 1] : '';

    const result: Record<string, unknown> = {
      output: finalOutput,
      allAgentOutputs: memory.agentOutputs,
      variables: memory.variables,
      conversationHistory: memory.conversationHistory, // Store history in execution record
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
