// ===================================================================
// Shared TypeScript Types & Enums
// ===================================================================
// Central place for types that are shared across layers (services,
// controllers, socket handlers). Prisma-generated enums are re-
// exported here for convenience.
// ===================================================================

// ─── Re-export Prisma enums so consumers don't import from @prisma/client directly ──

export {
  AIProvider,
  WorkflowStatus,
  ExecutionStatus,
  UserRole,
} from '@prisma/client';

// ─── Socket.io Event Names ──────────────────────────────────────

/**
 * Events emitted FROM the server TO connected clients.
 */
export const ServerEvents = {
  /** Broadcast when an execution changes status. */
  EXECUTION_STATUS: 'execution:status',
  /** Broadcast when an agent produces new output. */
  AGENT_OUTPUT: 'agent:output',
  /** Broadcast when a workflow is updated. */
  WORKFLOW_UPDATED: 'workflow:updated',
  /** Generic error pushed to a specific client. */
  ERROR: 'error',
} as const;

/**
 * Events received BY the server FROM connected clients.
 */
export const ClientEvents = {
  /** Client requests to start an execution. */
  START_EXECUTION: 'execution:start',
  /** Client requests to cancel a running execution. */
  CANCEL_EXECUTION: 'execution:cancel',
  /** Client joins a workflow room to receive live updates. */
  JOIN_WORKFLOW: 'workflow:join',
  /** Client leaves a workflow room. */
  LEAVE_WORKFLOW: 'workflow:leave',
} as const;

// ─── AI Provider Types ──────────────────────────────────────────

/**
 * Standard message format sent to any AI provider.
 */
export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Configuration shared across all AI providers.
 */
export interface AIRequestConfig {
  model: string;
  messages: AIMessage[];
  temperature?: number;
  maxTokens?: number;
}

/**
 * Standardized response from any AI provider.
 */
export interface AIResponse {
  content: string;
  model: string;
  provider: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
