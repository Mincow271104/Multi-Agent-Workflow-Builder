// ===================================================================
// Agent Service
// ===================================================================
// CRUD operations for Agent records (AI agent nodes in a workflow).
// ===================================================================

import prisma from '../config/db';
import { ApiError } from '../utils';
import type { AIProvider } from '@prisma/client';

// ─── Create ───────────────────────────────────────────────────────

export async function createAgent(data: {
  name: string;
  provider: AIProvider;
  model: string;
  systemPrompt?: string;
  config?: object;
  order?: number;
  workflowId: string;
}) {
  // Verify the workflow exists
  const workflow = await prisma.workflow.findUnique({
    where: { id: data.workflowId },
  });
  if (!workflow) {
    throw ApiError.notFound('Workflow not found');
  }

  return prisma.agent.create({
    data: {
      name: data.name,
      provider: data.provider,
      model: data.model,
      systemPrompt: data.systemPrompt,
      config: data.config ?? undefined,
      order: data.order ?? 0,
      workflowId: data.workflowId,
    },
  });
}

// ─── Get All (by workflow) ────────────────────────────────────────

export async function getAgentsByWorkflow(workflowId: string) {
  return prisma.agent.findMany({
    where: { workflowId },
    orderBy: { order: 'asc' },
  });
}

// ─── Get By ID ────────────────────────────────────────────────────

export async function getAgentById(id: string) {
  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent) {
    throw ApiError.notFound('Agent not found');
  }
  return agent;
}

// ─── Update ───────────────────────────────────────────────────────

export async function updateAgent(
  id: string,
  data: {
    name?: string;
    provider?: AIProvider;
    model?: string;
    systemPrompt?: string;
    config?: object;
    order?: number;
  },
) {
  await getAgentById(id); // ensure exists
  return prisma.agent.update({ where: { id }, data });
}

// ─── Delete ───────────────────────────────────────────────────────

export async function deleteAgent(id: string) {
  await getAgentById(id); // ensure exists
  return prisma.agent.delete({ where: { id } });
}

export default {
  createAgent,
  getAgentsByWorkflow,
  getAgentById,
  updateAgent,
  deleteAgent,
};
