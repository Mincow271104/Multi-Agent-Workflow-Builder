// ===================================================================
// Socket.io Realtime Layer — Multi-Agent Workflow Builder
// ===================================================================
//
// This module sets up a Socket.io v4 server with:
//  1. JWT authentication on connection (middleware)
//  2. Workflow room management (join/leave)
//  3. Execution lifecycle events (start, stream, complete, error)
//  4. Integration with the Orchestrator for running workflows
//
// ARCHITECTURE:
//   Client connects → JWT verified → joins workflow rooms →
//   emits "startExecution" → Orchestrator runs agents →
//   server streams events back in realtime.
//
// CLIENT EVENTS (received by server):
//   - startExecution   { workflowId, input }
//   - cancelExecution  { executionId }
//   - joinWorkflow     { workflowId }
//   - leaveWorkflow    { workflowId }
//
// SERVER EVENTS (emitted to client):
//   - executionStarted   { executionId, workflowId }
//   - agentStarted       { executionId, nodeId, agentName, role, provider, model }
//   - agentStream        { executionId, nodeId, agentName, chunk, fullOutput }
//   - agentFinished      { executionId, nodeId, agentName, role, output, durationMs }
//   - executionCompleted { executionId, result, logs }
//   - executionError     { executionId, error }
//   - error              { message }
//
// USAGE:
//   import { setupSocket } from './socket';
//   const io = setupSocket(httpServer);
//
// ===================================================================

import http from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import prisma from '../config/db';
import { logger, verifyToken } from '../utils';
import { Orchestrator, WorkflowConfig } from '../services/orchestrator';

// ─── Types — Socket Events ──────────────────────────────────────

/**
 * Events the CLIENT sends TO the server.
 */
export interface ClientToServerEvents {
  /** Request to start executing a workflow */
  startExecution: (data: StartExecutionPayload) => void;
  /** Request to cancel a running execution */
  cancelExecution: (data: CancelExecutionPayload) => void;
  /** Join a workflow room for live updates */
  joinWorkflow: (data: JoinLeavePayload) => void;
  /** Leave a workflow room */
  leaveWorkflow: (data: JoinLeavePayload) => void;
}

/**
 * Events the SERVER sends TO the client.
 */
export interface ServerToClientEvents {
  /** Execution has started processing */
  executionStarted: (data: ExecutionStartedPayload) => void;
  /** An individual agent has started running */
  agentStarted: (data: AgentStartedPayload) => void;
  /** Streaming chunk from an agent's AI response */
  agentStream: (data: AgentStreamPayload) => void;
  /** An individual agent has finished */
  agentFinished: (data: AgentFinishedPayload) => void;
  /** Entire execution completed successfully */
  executionCompleted: (data: ExecutionCompletedPayload) => void;
  /** Execution failed with an error */
  executionError: (data: ExecutionErrorPayload) => void;
  /** Generic error (e.g. auth failure, invalid data) */
  error: (data: { message: string }) => void;
}

/**
 * Data stored on each socket (set during auth middleware).
 */
export interface SocketData {
  userId: string;
  userRole: string;
}

// ─── Payload Types ──────────────────────────────────────────────

/** Client → Server: Start an execution */
export interface StartExecutionPayload {
  /** The workflow to execute */
  workflowId: string;
  /** User input / prompt for the workflow */
  input?: string;
}

/** Client → Server: Cancel an execution */
export interface CancelExecutionPayload {
  /** The execution to cancel */
  executionId: string;
}

/** Client → Server: Join or leave a workflow room */
export interface JoinLeavePayload {
  workflowId: string;
}

/** Server → Client: Execution started */
export interface ExecutionStartedPayload {
  executionId: string;
  workflowId: string;
  timestamp: string;
}

/** Server → Client: Agent started */
export interface AgentStartedPayload {
  executionId: string;
  nodeId: string;
  agentName: string;
  role: string;
  provider: string;
  model: string;
  timestamp: string;
}

/** Server → Client: Streaming chunk from agent */
export interface AgentStreamPayload {
  executionId: string;
  nodeId: string;
  agentName: string;
  chunk: string;
  fullOutput: string;
  timestamp: string;
}

/** Server → Client: Agent finished */
export interface AgentFinishedPayload {
  executionId: string;
  nodeId: string;
  agentName: string;
  role: string;
  output: string;
  durationMs: number;
  timestamp: string;
}

/** Server → Client: Execution completed */
export interface ExecutionCompletedPayload {
  executionId: string;
  result: Record<string, unknown>;
  logs: Record<string, unknown>[];
  timestamp: string;
}

/** Server → Client: Execution error */
export interface ExecutionErrorPayload {
  executionId: string;
  error: string;
  timestamp: string;
}

// ─── Typed Socket alias ─────────────────────────────────────────

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type TypedIO = SocketIOServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

// ─── Orchestrator instance (shared across connections) ──────────

let orchestrator: Orchestrator;

// =====================================================================
// ██  SETUP — Main export
// =====================================================================

/**
 * Set up and attach a Socket.io server to the given HTTP server.
 *
 * This function:
 *  1. Creates a Socket.io server with CORS configured
 *  2. Adds JWT authentication middleware
 *  3. Registers all event handlers
 *  4. Creates the shared Orchestrator instance
 *
 * @param httpServer  The Node.js HTTP server (from Express)
 * @returns           The configured Socket.io server instance
 *
 * @example
 *   import { setupSocket } from './socket';
 *   const io = setupSocket(httpServer);
 */
export function setupSocket(httpServer: http.Server): TypedIO {
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

  // ── 1. Create Socket.io server ──────────────────────────────────

  const io: TypedIO = new SocketIOServer(httpServer, {
    cors: {
      origin: FRONTEND_URL,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Ping timeout / interval for connection health
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // ── 2. Create shared Orchestrator instance ──────────────────────
  //    The orchestrator already emits events via its own io reference.
  //    We also create a wrapper that translates its events into our
  //    typed event names for the frontend.

  orchestrator = new Orchestrator(io as unknown as SocketIOServer);

  // ── 3. JWT Authentication Middleware ────────────────────────────
  //    Every socket connection must provide a valid JWT token.
  //    Token can be sent as:
  //      - query parameter: ?token=xxx
  //      - auth object: { token: 'xxx' }

  io.use((socket, next) => {
    try {
      const token =
        (socket.handshake.auth as { token?: string })?.token ||
        (socket.handshake.query?.token as string);

      if (!token) {
        logger.warn(`[Socket] Connection rejected — no token provided (${socket.id})`);
        return next(new Error('Authentication required. Please provide a JWT token.'));
      }

      // Verify JWT and extract payload
      const decoded = verifyToken(token);

      // Attach user info to the socket data
      socket.data.userId = decoded.userId;
      socket.data.userRole = decoded.role;

      logger.info(
        `[Socket] Authenticated user ${decoded.userId} (role: ${decoded.role}) — socket ${socket.id}`,
      );

      next();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid token';
      logger.warn(`[Socket] Auth failed for ${socket.id}: ${message}`);
      next(new Error(`Authentication failed: ${message}`));
    }
  });

  // ── 4. Connection Handler ──────────────────────────────────────

  io.on('connection', (socket: TypedSocket) => {
    logger.info(
      `[Socket] Client connected: ${socket.id} (user: ${socket.data.userId})`,
    );

    // Register all event handlers for this socket
    handleJoinWorkflow(socket);
    handleLeaveWorkflow(socket);
    handleStartExecution(io, socket);
    handleCancelExecution(socket);
    handleDisconnect(socket);
  });

  logger.info('[Socket] Socket.io server initialized with JWT authentication.');
  return io;
}

// =====================================================================
// ██  EVENT HANDLERS
// =====================================================================

// ─── Join Workflow Room ─────────────────────────────────────────

/**
 * When a client opens a workflow page, they join its room to receive
 * live updates for all executions in that workflow.
 */
function handleJoinWorkflow(socket: TypedSocket): void {
  socket.on('joinWorkflow', ({ workflowId }) => {
    const room = `workflow:${workflowId}`;
    socket.join(room);
    logger.debug(`[Socket] ${socket.id} joined room ${room}`);
  });
}

// ─── Leave Workflow Room ────────────────────────────────────────

function handleLeaveWorkflow(socket: TypedSocket): void {
  socket.on('leaveWorkflow', ({ workflowId }) => {
    const room = `workflow:${workflowId}`;
    socket.leave(room);
    logger.debug(`[Socket] ${socket.id} left room ${room}`);
  });
}

// ─── Start Execution ────────────────────────────────────────────

/**
 * Main handler — client requests to execute a workflow.
 *
 * Flow:
 *  1. Validate the workflow exists and belongs to the user
 *  2. Load workflow config (nodes + edges from React Flow)
 *  3. Create an Execution record in Prisma
 *  4. Emit "executionStarted" to the workflow room
 *  5. Run the Orchestrator (async — does not block the socket)
 *  6. Orchestrator emits agent-level events as it progresses
 *  7. On completion, emit "executionCompleted" or "executionError"
 */
function handleStartExecution(io: TypedIO, socket: TypedSocket): void {
  socket.on('startExecution', async ({ workflowId, input }) => {
    const userId = socket.data.userId;

    try {
      // ── 1. Validate workflow ownership ──────────────────────────

      const workflow = await prisma.workflow.findFirst({
        where: { id: workflowId, userId },
        include: { agents: { orderBy: { order: 'asc' } } },
      });

      if (!workflow) {
        socket.emit('error', { message: 'Workflow not found or access denied.' });
        return;
      }

      // ── 2. Parse workflow config (React Flow format) ────────────

      // The config is stored as JSON in the workflow record.
      // It should contain { nodes, edges } from React Flow.
      // If config is empty, fall back to building from the agents table.
      let workflowConfig: WorkflowConfig;

      if (workflow.config && typeof workflow.config === 'object') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const config = workflow.config as any;
        if (config.nodes && config.edges) {
          workflowConfig = config as WorkflowConfig;
        } else {
          // Config exists but doesn't have nodes/edges — build from agents
          workflowConfig = buildConfigFromAgents(workflow);
        }
      } else {
        // No config — build a linear chain from the agents table
        workflowConfig = buildConfigFromAgents(workflow);
      }

      if (workflowConfig.nodes.length === 0) {
        socket.emit('error', { message: 'Workflow has no agents configured.' });
        return;
      }

      // ── 3. Create Execution record ─────────────────────────────

      const execution = await prisma.execution.create({
        data: {
          workflowId,
          input: input ? { userInput: input } : undefined,
          status: 'PENDING',
        },
      });

      logger.info(
        `[Socket] Execution created: ${execution.id} for workflow ${workflowId} ` +
        `(${workflowConfig.nodes.length} agents)`,
      );

      // ── 4. Emit "executionStarted" to the room ─────────────────

      const room = `workflow:${workflowId}`;
      io.to(room).emit('executionStarted', {
        executionId: execution.id,
        workflowId,
        timestamp: new Date().toISOString(),
      });

      // ── 5. Run orchestrator (fire-and-forget, non-blocking) ────
      //    The orchestrator emits its own events via io.to() as
      //    agents start, stream, and complete. We also listen for
      //    the final result to emit our typed events.

      runOrchestrator(io, execution.id, workflowId, workflowConfig, input || '');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[Socket] startExecution failed: ${message}`);
      socket.emit('error', { message: `Failed to start execution: ${message}` });
    }
  });
}

// ─── Cancel Execution ───────────────────────────────────────────

function handleCancelExecution(socket: TypedSocket): void {
  socket.on('cancelExecution', ({ executionId }) => {
    logger.info(`[Socket] Cancel requested for execution ${executionId} by ${socket.data.userId}`);
    orchestrator.cancel(executionId);
  });
}

// ─── Disconnect ─────────────────────────────────────────────────

function handleDisconnect(socket: TypedSocket): void {
  socket.on('disconnect', (reason) => {
    logger.info(`[Socket] Client disconnected: ${socket.id} (${reason})`);
  });
}

// =====================================================================
// ██  ORCHESTRATOR RUNNER
// =====================================================================

/**
 * Run the orchestrator asynchronously and emit final result events.
 *
 * This function catches all errors and ensures we always emit either
 * "executionCompleted" or "executionError" to the workflow room.
 *
 * The orchestrator itself emits agent-level events (via ServerEvents
 * in models/types.ts). This wrapper translates the final result into
 * our typed socket events.
 */
async function runOrchestrator(
  io: TypedIO,
  executionId: string,
  workflowId: string,
  workflowConfig: WorkflowConfig,
  userInput: string,
): Promise<void> {
  const room = `workflow:${workflowId}`;

  try {
    const result = await orchestrator.execute(executionId, workflowConfig, userInput);

    // Emit completion event with the final result
    io.to(room).emit('executionCompleted', {
      executionId,
      result: (result.result as Record<string, unknown>) || {},
      logs: (result.logs as Record<string, unknown>[]) || [],
      timestamp: new Date().toISOString(),
    });

    logger.info(
      `[Socket] Execution ${executionId} completed — status: ${result.status}`,
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    io.to(room).emit('executionError', {
      executionId,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });

    logger.error(`[Socket] Execution ${executionId} errored: ${errorMessage}`);
  }
}

// =====================================================================
// ██  HELPERS
// =====================================================================

/**
 * Build a WorkflowConfig from the database agents table.
 *
 * When the user hasn't designed a React Flow graph yet, we fall back
 * to a simple linear chain based on the agents' `order` field:
 *   Agent(order=0) → Agent(order=1) → Agent(order=2) → ...
 *
 * @param workflow  Prisma workflow with agents included.
 * @returns         A WorkflowConfig with auto-generated nodes and edges.
 */
function buildConfigFromAgents(workflow: {
  agents: Array<{
    id: string;
    name: string;
    provider: string;
    model: string;
    systemPrompt: string | null;
    config: unknown;
    order: number;
  }>;
}): WorkflowConfig {
  const agents = workflow.agents;

  // Build nodes from agents (sorted by order)
  const nodes = agents.map((agent, index) => ({
    id: agent.id,
    type: 'agentNode',
    position: { x: 250, y: index * 150 }, // Simple vertical layout
    data: {
      label: agent.name,
      role: agent.name, // Use agent name as role if not explicitly set
      provider: agent.provider.toLowerCase() as 'ollama' | 'groq' | 'gemini',
      model: agent.model,
      systemPrompt: agent.systemPrompt || undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      temperature: (agent.config as any)?.temperature,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      maxTokens: (agent.config as any)?.maxTokens,
    },
  }));

  // Build edges — linear chain: agent[0] → agent[1] → agent[2] → ...
  const edges = nodes.slice(0, -1).map((node, index) => ({
    id: `edge_${index}`,
    source: node.id,
    target: nodes[index + 1].id,
  }));

  return { nodes, edges };
}

// ─── Exports ────────────────────────────────────────────────────

export default setupSocket;
