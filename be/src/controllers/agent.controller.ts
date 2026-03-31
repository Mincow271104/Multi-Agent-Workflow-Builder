// ===================================================================
// Agent Controller
// ===================================================================

import { Request, Response } from 'express';
import { z } from 'zod';
import { catchAsync, apiResponse } from '../utils';
import * as agentService from '../services/agent.service';
import { getAIProvider } from '../services/ai/ai-provider.factory';

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

const generatePromptSchema = z.object({
  role: z.string().min(1, 'Role is required'),
  provider: z.enum(['OLLAMA', 'GROQ', 'GEMINI']),
  model: z.string().min(1, 'Model is required'),
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

/** POST /api/v1/agents/generate-prompt */
export const generatePrompt = catchAsync(async (req: Request, res: Response) => {
  const { role, provider, model } = generatePromptSchema.parse(req.body);

  const metaPrompt = `You are an expert AI Architect. Your task is to write a System Prompt for a new AI Agent. The agent's role is: "${role}".

CRITICAL INSTRUCTIONS:
1. Write a complete System Prompt instructing the agent on its core expertise, tone, and step-by-step methodologies based strictly on the role "${role}".
2. Start the prompt with "You are an expert ${role}...".
3. Focus ONLY on the agent's domain expertise, personality, and working methodology.
4. Do NOT include any OUTPUT FORMAT rules, JSON schemas, or response formatting instructions. The orchestration system handles output formatting separately at runtime.
5. DO NOT return a JSON object yourself. You are writing the INSTRUCTIONS that the agent will receive.
6. Do NOT wrap your response in markdown code blocks. Just return the raw text of the System Prompt you created.`;

  const llm = getAIProvider(provider);
  const response = await llm.chat({
    model,
    messages: [
      { role: 'system', content: 'You are an AI Architect building system prompts.' },
      { role: 'user', content: metaPrompt }
    ],
    temperature: 0.7,
  });

  const generatedPrompt = response.content.replace(/^\`\`\`[a-z]*\n/i, '').replace(/\n\`\`\`$/, '').trim();

  apiResponse({ res, statusCode: 200, message: 'Prompt generated successfully', data: { prompt: generatedPrompt } });
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
