// ===================================================================
// src/controllers/execution.controller.ts
// ===================================================================
// Handles workflow execution — starting, viewing, and history.
//
// Endpoints:
//   POST /api/v1/executions/start   — Start a workflow execution
//   GET  /api/v1/executions/:id     — Get execution details + logs
//   GET  /api/v1/executions/workflow/:workflowId — Execution history
//
// The start endpoint creates an Execution record, then triggers the
// Orchestrator which runs asynchronously. Real-time progress is
// pushed to the client via Socket.io (see src/socket/index.ts).
// ===================================================================

import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { catchAsync, apiResponse, ApiError, logger } from '../utils';
import { Orchestrator, WorkflowConfig } from '../services/orchestrator';
import { getIO } from '../socket/socketManager';

// ─── Zod Validation Schemas ─────────────────────────────────────

/** Start execution request body */
const startExecutionSchema = z.object({
  /** Workflow ID to execute */
  workflowId: z.string().uuid('Invalid workflow ID'),
  /** User input / prompt for the workflow */
  input: z.string().min(1, 'Input is required').max(10000),
});

// ─── Helper ─────────────────────────────────────────────────────

function requireUserId(req: Request): string {
  if (!req.userId) throw ApiError.unauthorized('Not authenticated.');
  return req.userId;
}

// ─── POST /executions/start — Start Execution ───────────────────

/**
 * Start executing a workflow.
 *
 * Flow:
 *  1. Validate input (Zod)
 *  2. Verify workflow exists and belongs to user
 *  3. Load workflow config (React Flow nodes + edges)
 *  4. Create Execution record in database (status: PENDING)
 *  5. Return the execution ID immediately
 *  6. Trigger Orchestrator asynchronously (non-blocking)
 *
 * The orchestrator runs in the background and pushes real-time
 * updates via Socket.io events.
 */
export const startExecution = catchAsync(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const data = startExecutionSchema.parse(req.body);

  // 1. Verify workflow exists and belongs to the user
  const workflow = await prisma.workflow.findFirst({
    where: { id: data.workflowId, userId },
    include: { agents: { orderBy: { order: 'asc' } } },
  });

  if (!workflow) {
    throw ApiError.notFound('Workflow not found or access denied.');
  }

  if (workflow.agents.length === 0) {
    throw ApiError.badRequest('Cannot execute: workflow has no agents configured.');
  }

  // 2. Parse workflow config (React Flow format)
  let workflowConfig: WorkflowConfig;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config = workflow.config as any;
  if (config?.nodes?.length > 0 && config?.edges) {
    // Use the React Flow graph from config
    workflowConfig = config as WorkflowConfig;
  } else {
    // Fallback: build a linear chain from agents table
    workflowConfig = buildLinearConfig(workflow.agents);
  }

  // 3. Create Execution record
  const execution = await prisma.execution.create({
    data: {
      workflowId: data.workflowId,
      input: { userInput: data.input },
      status: 'PENDING',
    },
  });

  logger.info(
    `[Execution] Created ${execution.id} for workflow "${workflow.name}" ` +
    `(${workflowConfig.nodes.length} agents)`,
  );

  // 4. Return immediately — the orchestrator runs async
  apiResponse({
    res,
    statusCode: 202, // 202 Accepted — processing started
    message: 'Execution started. Watch Socket.io events for real-time progress.',
    data: {
      executionId: execution.id,
      workflowId: data.workflowId,
      workflowName: workflow.name,
      agentCount: workflowConfig.nodes.length,
      status: 'PENDING',
    },
  });

  // 5. Trigger orchestrator in background (fire-and-forget)
  //    Errors are caught inside and saved to the execution record.
  const io = getIO();
  const orchestrator = new Orchestrator(io);

  orchestrator
    .execute(execution.id, workflowConfig, data.input)
    .then((result) => {
      logger.info(
        `[Execution] ${execution.id} completed with status: ${result.status}`,
      );
    })
    .catch((error) => {
      logger.error(
        `[Execution] ${execution.id} unhandled error: ${error.message}`,
      );
    });
});

// ─── GET /executions/:id — Get Execution Details ────────────────

/**
 * Get a single execution with its full logs and result.
 * Useful for viewing completed execution details.
 */
export const getById = catchAsync(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const executionId = req.params.id as string;

  const execution = await prisma.execution.findUnique({
    where: { id: executionId },
    include: {
      workflow: {
        select: { id: true, name: true, userId: true },
      },
    },
  });

  if (!execution) {
    throw ApiError.notFound('Execution not found.');
  }

  // Verify the user owns the parent workflow
  if (execution.workflow.userId !== userId) {
    throw ApiError.forbidden('Access denied.');
  }

  apiResponse({
    res,
    message: 'Execution retrieved',
    data: execution,
  });
});

// ─── GET /executions/workflow/:workflowId — Execution History ───

/**
 * Get the execution history for a specific workflow.
 * Returns most recent executions first, with summary info.
 */
export const getByWorkflow = catchAsync(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const workflowId = req.params.workflowId as string;

  // Verify the user owns the workflow
  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, userId },
    select: { id: true },
  });
  if (!workflow) {
    throw ApiError.notFound('Workflow not found or access denied.');
  }

  // Pagination via query params
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const skip = (page - 1) * limit;

  const [executions, total] = await Promise.all([
    prisma.execution.findMany({
      where: { workflowId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        status: true,
        input: true,
        result: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
      },
    }),
    prisma.execution.count({ where: { workflowId } }),
  ]);

  apiResponse({
    res,
    message: `Found ${total} execution(s)`,
    data: {
      executions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
  });
});

// ─── Helper: Build linear config from agents ────────────────────

/**
 * Build a linear WorkflowConfig when no React Flow graph exists.
 * Creates a simple chain: Agent[0] → Agent[1] → Agent[2] → ...
 */
function buildLinearConfig(
  agents: Array<{
    id: string;
    name: string;
    provider: string;
    model: string;
    systemPrompt: string | null;
    config: unknown;
    order: number;
  }>,
): WorkflowConfig {
  const nodes = agents.map((agent, i) => ({
    id: agent.id,
    type: 'agentNode',
    position: { x: 250, y: i * 150 },
    data: {
      label: agent.name,
      role: agent.name,
      provider: agent.provider.toLowerCase() as 'ollama' | 'groq' | 'gemini',
      model: agent.model,
      systemPrompt: agent.systemPrompt || undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      temperature: (agent.config as any)?.temperature,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      maxTokens: (agent.config as any)?.maxTokens,
    },
  }));

  const edges = nodes.slice(0, -1).map((node, i) => ({
    id: `edge_${i}`,
    source: node.id,
    target: nodes[i + 1].id,
  }));

  return { nodes, edges };
}
