// ===================================================================
// Agent Controller
// ===================================================================

import { Request, Response } from 'express';
import { z } from 'zod';
import { catchAsync, apiResponse } from '../utils';
import * as agentService from '../services/agent.service';

// ─── Validation Schemas ───────────────────────────────────────────

const createAgentSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  provider: z.enum(['OLLAMA', 'GROQ', 'GEMINI']),
  model: z.string().min(1, 'Model is required'),
  systemPrompt: z.string().optional(),
  config: z.record(z.unknown()).optional(),
  order: z.number().int().min(0).optional(),
  workflowId: z.string().uuid('Invalid workflow ID'),
});

const updateAgentSchema = z.object({
  name: z.string().min(1).optional(),
  provider: z.enum(['OLLAMA', 'GROQ', 'GEMINI']).optional(),
  model: z.string().min(1).optional(),
  systemPrompt: z.string().optional(),
  config: z.record(z.unknown()).optional(),
  order: z.number().int().min(0).optional(),
});

// ─── Handlers ─────────────────────────────────────────────────────

/** POST /api/v1/agents */
export const create = catchAsync(async (req: Request, res: Response) => {
  const data = createAgentSchema.parse(req.body);
  const agent = await agentService.createAgent(data);

  apiResponse({ res, statusCode: 201, message: 'Agent created', data: agent });
});

/** GET /api/v1/agents/workflow/:workflowId */
export const getByWorkflow = catchAsync(async (req: Request, res: Response) => {
  const agents = await agentService.getAgentsByWorkflow(req.params.workflowId as string);

  apiResponse({ res, message: 'Agents retrieved', data: agents });
});

/** GET /api/v1/agents/:id */
export const getById = catchAsync(async (req: Request, res: Response) => {
  const agent = await agentService.getAgentById(req.params.id as string);

  apiResponse({ res, message: 'Agent retrieved', data: agent });
});

/** PUT /api/v1/agents/:id */
export const update = catchAsync(async (req: Request, res: Response) => {
  const data = updateAgentSchema.parse(req.body);
  const agent = await agentService.updateAgent(req.params.id as string, data);

  apiResponse({ res, message: 'Agent updated', data: agent });
});

/** DELETE /api/v1/agents/:id */
export const remove = catchAsync(async (req: Request, res: Response) => {
  await agentService.deleteAgent(req.params.id as string);

  apiResponse({ res, message: 'Agent deleted' });
});
