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
  userId: string;
  agents?: Agent[];
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
  color: string;
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    role: 'researcher',
    label: 'Researcher',
    icon: '🔍',
    defaultProvider: 'ollama',
    defaultModel: 'phi3:mini',
    defaultPrompt: 'You are a researcher. Analyze topics thoroughly with key facts and insights.',
    color: '#3b82f6',
  },
  {
    role: 'writer',
    label: 'Writer',
    icon: '✍️',
    defaultProvider: 'ollama',
    defaultModel: 'phi3:mini',
    defaultPrompt: 'You are a writer. Create well-written, engaging content from research.',
    color: '#22c55e',
  },
  {
    role: 'critic',
    label: 'Critic',
    icon: '🧐',
    defaultProvider: 'ollama',
    defaultModel: 'phi3:mini',
    defaultPrompt: 'You are a critic. Review content critically and provide actionable feedback.',
    color: '#f59e0b',
  },
  {
    role: 'publisher',
    label: 'Publisher',
    icon: '📢',
    defaultProvider: 'ollama',
    defaultModel: 'phi3:mini',
    defaultPrompt: 'You are a publisher. Finalize and polish content for publication.',
    color: '#a855f7',
  },
  {
    role: 'custom',
    label: 'Custom Agent',
    icon: '🤖',
    defaultProvider: 'ollama',
    defaultModel: 'phi3:mini',
    defaultPrompt: 'You are a helpful assistant.',
    color: '#6366f1',
  },
];
