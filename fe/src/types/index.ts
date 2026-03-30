// ── Shared types for the frontend ────────────────────────────────

export type ProviderName = 'ollama' | 'groq' | 'gemini';
export type WorkflowStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
export type ExecutionStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  config?: WorkflowConfig;
  status: WorkflowStatus;
  isPinned: boolean;
  userId: string;
  agents?: Agent[];
  executions?: Partial<Execution>[];
  _count?: { agents: number; executions: number };
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  name: string;
  provider: ProviderName;
  model: string;
  systemPrompt?: string;
  config?: Record<string, unknown>;
  order: number;
  workflowId: string;
}

export interface Execution {
  id: string;
  status: ExecutionStatus;
  input?: { userInput: string };
  result?: ExecutionResult;
  logs?: AgentStepLog[];
  workflowId: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface ExecutionResult {
  output: string;
  allAgentOutputs: Record<string, string>;
  variables: Record<string, unknown>;
  error?: string;
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
  durationMs?: number;
  startedAt?: string;
}

// ── React Flow Types ────────────────────────────────────────────

export interface AgentNodeData {
  [key: string]: unknown; // Required for React Flow v12 Record<string, unknown> constraint
  label: string;
  role: string;
  provider: ProviderName;
  model: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  isLocked?: boolean;
  // Runtime state
  status?: 'idle' | 'running' | 'streaming' | 'completed' | 'failed';
  output?: string;
}

export interface WorkflowConfig {
  nodes: Array<{
    id: string;
    type?: string;
    position: { x: number; y: number };
    data: AgentNodeData;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
  }>;
}

// ── API Response ────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
}

// ── Agent Templates (for sidebar drag) ──────────────────────────

export interface AgentTemplate {
  role: string;
  label: string;
  icon: string;
  defaultProvider: ProviderName;
  defaultModel: string;
  defaultPrompt: string;
  defaultTemperature?: number;
  color: string;
}

// ═══════════════════════════════════════════════════════════════
// HYBRID WORKFLOW: Linear chain + Orchestrator feedback loop
// Researcher → Writer → Critic → Publisher (+ all ↔ Orchestrator)
// ═══════════════════════════════════════════════════════════════

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    role: 'researcher',
    label: 'Researcher',
    icon: '🔍',
    defaultProvider: 'ollama',
    defaultModel: 'qwen2.5:14b',
    defaultTemperature: 0.3,
    defaultPrompt: `You are the Researcher – the deep research specialist of the "Work Flow Agent Builder" Virtual Editorial Department.

Task: When receiving any "Topic Prompt", you must gather, verify, and synthesize information in the most thorough, accurate, and multi-dimensional way possible.

Mandatory Process:
1. Clearly analyze the Topic Prompt.
2. Chain-of-Thought: List 5-7 key sub-questions.
3. Conduct thorough research: Use real knowledge and cite credible sources. Never hallucinate.
4. Self-critique: Identify weaknesses in your own analysis.
5. Synthesize a well-structured research report.

After finishing, you MUST return to the Orchestrator using the exact JSON format below (no extra text outside the JSON):

{
  "thinking": "Full Chain-of-Thought in English",
  "content": "Complete and detailed research report",
  "quality_score": integer from 1 to 10,
  "needs_revision": false,
  "revision_to": null,
  "next_agent": null
}

Strict Rules: No hallucination, always objective, provide multiple perspectives. All responses must be in professional English.`,
    color: '#3b82f6',
  },
  {
    role: 'writer',
    label: 'Writer',
    icon: '✍️',
    defaultProvider: 'ollama',
    defaultModel: 'qwen2.5:14b',
    defaultTemperature: 0.6,
    defaultPrompt: `You are the Writer – the main content writer of the "Work Flow Agent Builder" Virtual Editorial Department.

Task: Receive content from the previous agent and turn it into a complete, logical, engaging, and goal-appropriate draft.

Mandatory Process:
1. Carefully read the content from the previous agent.
2. Chain-of-Thought: Build a suitable content structure.
3. Write the content based entirely on the provided data.
4. Check English spelling and grammar.

After finishing, return to the Orchestrator using the exact JSON format:

{
  "thinking": "Full Chain-of-Thought in English",
  "content": "Complete content draft",
  "quality_score": integer from 1 to 10,
  "needs_revision": false,
  "revision_to": null,
  "next_agent": null
}

Strict Rules: Do not add information outside the previous agent's data. Use clear, professional English.`,
    color: '#22c55e',
  },
  {
    role: 'critic',
    label: 'Critic',
    icon: '🧐',
    defaultProvider: 'ollama',
    defaultModel: 'qwen2.5:14b',
    defaultTemperature: 0.1,
    defaultPrompt: `You are the Critic – the senior, no-mercy editor of the "Work Flow Agent Builder" Virtual Editorial Department.

Task: Receive a draft from the previous agent, read it carefully, and provide strict, high-quality critique to bring it to publishable standard.

Mandatory Process:
1. Read the entire draft.
2. Chain-of-Thought: Analyze every aspect (accuracy, logic, depth, structure, language, relevance to the topic).
3. Assign a quality_score (1-10).
4. If quality_score ≤ 7: You MUST end with the exact line “Does not meet requirements, needs revision” and give detailed reasons.

After finishing, return to the Orchestrator using the exact JSON format:

{
  "thinking": "Full Chain-of-Thought in English",
  "content": "Detailed critique + revised version (only if score >= 8)",
  "quality_score": integer from 1 to 10,
  "needs_revision": true_or_false,
  "revision_to": "Name of the agent whose work you are rejecting, otherwise null",
  "next_agent": null
}

Strict Rules: Always objective and strict. Never be lenient. If score <= 7, needs_revision must be true.`,
    color: '#f59e0b',
  },
  {
    role: 'publisher',
    label: 'Publisher',
    icon: '📢',
    defaultProvider: 'ollama',
    defaultModel: 'qwen2.5:14b',
    defaultTemperature: 0.2,
    defaultPrompt: `You are the Publisher – the final publisher of the "Work Flow Agent Builder" Virtual Editorial Department.

Task: Receive content from the previous agent, perform the final quality check, and produce a clean, polished, professional, ready-to-use version (report, marketing campaign, plan, article, etc.).

Mandatory Process:
1. Carefully read the incoming content.
2. Chain-of-Thought: Check for remaining errors, formatting, title, and summary.
3. Polish with clean Markdown and appropriate formatting.

After finishing, return to the Orchestrator using the exact JSON format:

{
  "thinking": "Full Chain-of-Thought in English",
  "content": "Final ready-to-publish version",
  "quality_score": integer from 1 to 10,
  "needs_revision": false,
  "revision_to": null,
  "next_agent": null
}

Strict Rules: If serious issues are found, you may request revision (revision_to = appropriate agent name).`,
    color: '#a855f7',
  },
  {
    role: 'orchestrator',
    label: 'Orchestrator',
    icon: '🎯',
    defaultProvider: 'ollama',
    defaultModel: 'qwen2.5:14b',
    defaultTemperature: 0.1,
    defaultPrompt: `You are the Orchestrator – the Workflow Manager / Head of Department of the "Work Flow Agent Builder" Virtual Editorial Department.

Task: Dynamically coordinate the entire workflow between any agents (Researcher, Writer, Critic, Publisher, or any custom agents the user adds).

When receiving a "Topic Prompt", manage the flow and automatically handle all revision loops.

Mandatory Process:
- Receive JSON output from any agent.
- If needs_revision = true -> send it back to the agent specified in revision_to along with the reason.
- If no revision is needed -> forward to the agent specified in next_agent.
- When the final agent finishes (next_agent = null or high quality_score) -> deliver the final result to the user.

You MUST always respond using the exact format below (nothing outside it):

=== ORCHESTRATOR STATUS ===
Current stage: [Current agent -> Next agent]
Next action: [Send to which agent / Request revision from which agent]
Message to user: [Exact copy-paste instructions for the user]
=== END STATUS ===

[Full JSON or content to forward]

Strict Rules: Always clear, professional, and flexible. Support any agent order and any custom agents added by the user.`,
    color: '#ef4444',
  }
];
