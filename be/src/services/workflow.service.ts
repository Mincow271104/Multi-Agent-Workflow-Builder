// ===================================================================
// Workflow Service
// ===================================================================
// CRUD operations for Workflow records.
// ===================================================================

import prisma from '../config/db';
import { ApiError } from '../utils';
import type { WorkflowStatus } from '@prisma/client';

// ─── Create ───────────────────────────────────────────────────────

export async function createWorkflow(data: {
  name: string;
  description?: string;
  config?: object;
  userId: string;
}) {
  return prisma.workflow.create({
    data: {
      name: data.name,
      description: data.description,
      config: data.config ?? undefined,
      userId: data.userId,
    },
    include: { agents: true },
  });
}

// ─── Get All (by user) ───────────────────────────────────────────

export async function getWorkflowsByUser(userId: string) {
  return prisma.workflow.findMany({
    where: { userId },
    include: { agents: true, _count: { select: { executions: true } } },
    orderBy: { updatedAt: 'desc' },
  });
}

// ─── Get By ID ────────────────────────────────────────────────────

export async function getWorkflowById(id: string, userId: string) {
  const workflow = await prisma.workflow.findFirst({
    where: { id, userId },
    include: {
      agents: { orderBy: { order: 'asc' } },
      executions: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  });

  if (!workflow) {
    throw ApiError.notFound('Workflow not found');
  }

  return workflow;
}

// ─── Update ───────────────────────────────────────────────────────

export async function updateWorkflow(
  id: string,
  userId: string,
  data: { name?: string; description?: string; config?: object; status?: WorkflowStatus },
) {
  // Ensure the workflow belongs to the user
  await getWorkflowById(id, userId);

  return prisma.workflow.update({
    where: { id },
    data,
    include: { agents: true },
  });
}

// ─── Delete ───────────────────────────────────────────────────────

export async function deleteWorkflow(id: string, userId: string) {
  // Ensure the workflow belongs to the user
  await getWorkflowById(id, userId);

  return prisma.workflow.delete({ where: { id } });
}

export default {
  createWorkflow,
  getWorkflowsByUser,
  getWorkflowById,
  updateWorkflow,
  deleteWorkflow,
};
