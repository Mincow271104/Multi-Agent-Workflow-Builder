// ===================================================================
// src/controllers/workflow.controller.ts
// ===================================================================
// Full CRUD for Workflow records.
//
// Endpoints:
//   POST   /api/v1/workflows         — Create a new workflow
//   GET    /api/v1/workflows         — List all workflows (user-scoped)
//   GET    /api/v1/workflows/:id     — Get a single workflow with agents
//   PUT    /api/v1/workflows/:id     — Update a workflow
//   DELETE /api/v1/workflows/:id     — Delete a workflow
//
// All routes require JWT authentication.
// Users can only access their own workflows.
// ===================================================================

import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { catchAsync, apiResponse, ApiError, logger } from '../utils';

// ─── Zod Validation Schemas ─────────────────────────────────────

/** Create workflow schema */
const createWorkflowSchema = z.object({
  name: z.string().min(1, 'Workflow name is required').max(255),
  description: z.string().max(2000).optional(),
  /** React Flow config: { nodes: [...], edges: [...] } */
  config: z
    .object({
      nodes: z.array(z.any()).optional(),
      edges: z.array(z.any()).optional(),
    })
    .passthrough()
    .optional(),
});

/** Update workflow schema (all fields optional) */
const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  config: z
    .object({
      nodes: z.array(z.any()).optional(),
      edges: z.array(z.any()).optional(),
    })
    .passthrough()
    .optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
});

// ─── Helper ─────────────────────────────────────────────────────

/** Extract and validate the authenticated user ID from request. */
function requireUserId(req: Request): string {
  if (!req.userId) throw ApiError.unauthorized('Not authenticated.');
  return req.userId;
}

// ─── POST /workflows — Create ───────────────────────────────────

/**
 * Create a new workflow for the authenticated user.
 *
 * The config field stores the React Flow graph (nodes + edges).
 * Initially it can be empty — the user will build it in the UI.
 */
export const create = catchAsync(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const data = createWorkflowSchema.parse(req.body);

  const workflow = await prisma.workflow.create({
    data: {
      name: data.name,
      description: data.description,
      config: data.config ? JSON.parse(JSON.stringify(data.config)) : undefined,
      userId,
    },
    include: {
      agents: { orderBy: { order: 'asc' } },
      _count: { select: { executions: true } },
    },
  });

  logger.info(`[Workflow] Created "${workflow.name}" (${workflow.id}) by user ${userId}`);

  apiResponse({
    res,
    statusCode: 201,
    message: 'Workflow created successfully',
    data: workflow,
  });
});

// ─── GET /workflows — List All ──────────────────────────────────

/**
 * List all workflows belonging to the authenticated user.
 * Includes agent count and execution count for dashboard display.
 */
export const getAll = catchAsync(async (req: Request, res: Response) => {
  const userId = requireUserId(req);

  const workflows = await prisma.workflow.findMany({
    where: { userId },
    include: {
      _count: { select: { agents: true, executions: true } },
      agents: {
        orderBy: { order: 'asc' },
        select: { id: true, name: true, provider: true, model: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  apiResponse({
    res,
    message: `Found ${workflows.length} workflow(s)`,
    data: workflows,
  });
});

// ─── GET /workflows/:id — Get By ID ────────────────────────────

/**
 * Get a single workflow with full details: agents, recent executions,
 * and the React Flow config (nodes + edges).
 */
export const getById = catchAsync(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const workflowId = req.params.id as string;

  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, userId },
    include: {
      agents: { orderBy: { order: 'asc' } },
      executions: {
        orderBy: { createdAt: 'desc' },
        take: 20, // Last 20 executions
        select: {
          id: true,
          status: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
        },
      },
      _count: { select: { executions: true } },
    },
  });

  if (!workflow) {
    throw ApiError.notFound('Workflow not found.');
  }

  apiResponse({
    res,
    message: 'Workflow retrieved',
    data: workflow,
  });
});

// ─── PUT /workflows/:id — Update ────────────────────────────────

/**
 * Update a workflow's name, description, config (React Flow), or status.
 * Only the workflow owner can update it.
 */
export const update = catchAsync(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const workflowId = req.params.id as string;
  const data = updateWorkflowSchema.parse(req.body);

  // Verify ownership
  const existing = await prisma.workflow.findFirst({
    where: { id: workflowId, userId },
  });
  if (!existing) {
    throw ApiError.notFound('Workflow not found.');
  }

  // ── Sync canvas nodes → Agent DB records ──────────────────────
  // When the frontend saves the React Flow config, we extract the
  // agent nodes and create/update matching Agent rows so the
  // orchestrator can find them when running the workflow.
  // ──────────────────────────────────────────────────────────────

  if (data.config?.nodes && Array.isArray(data.config.nodes)) {
    const canvasNodes = data.config.nodes.filter(
      (n: any) => n.type === 'agentNode' && n.data,
    );

    if (canvasNodes.length > 0) {
      // Map frontend provider names to Prisma AIProvider enum
      const mapProvider = (p: string): 'OLLAMA' | 'GROQ' | 'GEMINI' => {
        const upper = (p || 'ollama').toUpperCase();
        if (upper === 'GROQ') return 'GROQ';
        if (upper === 'GEMINI') return 'GEMINI';
        return 'OLLAMA';
      };

      // Delete all existing agents for this workflow, then recreate
      // This is simpler and safer than trying to diff/merge
      await prisma.agent.deleteMany({ where: { workflowId } });

      // Create new agents from canvas nodes
      const agentRecords = canvasNodes.map((node: any, idx: number) => ({
        id: node.id, // Use the React Flow node ID so we can match events
        name: node.data.label || node.data.role || `Agent ${idx + 1}`,
        provider: mapProvider(node.data.provider),
        model: node.data.model || 'phi3:mini',
        systemPrompt: node.data.systemPrompt || null,
        config: JSON.parse(JSON.stringify({
          temperature: node.data.temperature ?? 0.7,
          maxTokens: node.data.maxTokens ?? 2048,
          role: node.data.role,
        })),
        order: idx,
        workflowId,
      }));

      await prisma.agent.createMany({ data: agentRecords });

      logger.info(`[Workflow] Synced ${agentRecords.length} agent(s) from canvas to DB for workflow ${workflowId}`);
    }
  }

  const updated = await prisma.workflow.update({
    where: { id: workflowId },
    data: {
      ...data,
      config: data.config ? JSON.parse(JSON.stringify(data.config)) : undefined,
    },
    include: {
      agents: { orderBy: { order: 'asc' } },
      _count: { select: { executions: true } },
    },
  });

  logger.info(`[Workflow] Updated "${updated.name}" (${updated.id}) — ${updated.agents.length} agent(s)`);

  apiResponse({
    res,
    message: 'Workflow updated successfully',
    data: updated,
  });
});

// ─── DELETE /workflows/:id — Delete ─────────────────────────────

/**
 * Delete a workflow and all its agents + executions (cascade).
 * Only the workflow owner can delete it.
 */
export const remove = catchAsync(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const workflowId = req.params.id as string;

  // Verify ownership
  const existing = await prisma.workflow.findFirst({
    where: { id: workflowId, userId },
  });
  if (!existing) {
    throw ApiError.notFound('Workflow not found.');
  }

  await prisma.workflow.delete({ where: { id: workflowId } });

  logger.info(`[Workflow] Deleted "${existing.name}" (${existing.id})`);

  apiResponse({
    res,
    message: 'Workflow deleted successfully',
  });
});
