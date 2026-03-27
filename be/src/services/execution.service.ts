// ===================================================================
// Execution Service
// ===================================================================
// CRUD + run logic for workflow Execution records.
// The `runExecution` method orchestrates agent calls sequentially.
// ===================================================================

import prisma from '../config/db';
import { ApiError, logger } from '../utils';
import { getAIProvider } from './ai/ai-provider.factory';
import type { AIMessage } from '../models/types';

// ─── Create ───────────────────────────────────────────────────────

export async function createExecution(data: { workflowId: string; input?: object }) {
  // Verify workflow exists
  const workflow = await prisma.workflow.findUnique({ where: { id: data.workflowId } });
  if (!workflow) {
    throw ApiError.notFound('Workflow not found');
  }

  return prisma.execution.create({
    data: {
      workflowId: data.workflowId,
      input: data.input ?? undefined,
    },
  });
}

// ─── Get All (by workflow) ────────────────────────────────────────

export async function getExecutionsByWorkflow(workflowId: string) {
  return prisma.execution.findMany({
    where: { workflowId },
    orderBy: { createdAt: 'desc' },
  });
}

// ─── Get By ID ────────────────────────────────────────────────────

export async function getExecutionById(id: string) {
  const execution = await prisma.execution.findUnique({ where: { id } });
  if (!execution) {
    throw ApiError.notFound('Execution not found');
  }
  return execution;
}

// ─── Run Execution ────────────────────────────────────────────────

/**
 * Execute a workflow by running its agents sequentially.
 *
 * Each agent receives the previous agent's output as context.
 * Logs are accumulated and stored in the execution record.
 *
 * @param executionId  ID of the Execution record.
 * @returns            Updated Execution with result and logs.
 */
export async function runExecution(executionId: string) {
  // 1. Mark as RUNNING
  let execution = await prisma.execution.update({
    where: { id: executionId },
    data: { status: 'RUNNING', startedAt: new Date() },
  });

  // 2. Load workflow + agents (ordered)
  const workflow = await prisma.workflow.findUnique({
    where: { id: execution.workflowId },
    include: { agents: { orderBy: { order: 'asc' } } },
  });

  if (!workflow || workflow.agents.length === 0) {
    return prisma.execution.update({
      where: { id: executionId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        logs: [{ error: 'Workflow has no agents' }],
      },
    });
  }

  // 3. Run agents sequentially, passing output to next
  const logs: object[] = [];
  let previousOutput = JSON.stringify(execution.input ?? {});

  try {
    for (const agent of workflow.agents) {
      logger.info(`[Execution ${executionId}] Running agent "${agent.name}" (${agent.provider})`);

      const provider = getAIProvider(agent.provider);

      // Build messages
      const messages: AIMessage[] = [];
      if (agent.systemPrompt) {
        messages.push({ role: 'system', content: agent.systemPrompt });
      }
      messages.push({ role: 'user', content: previousOutput });

      // Call AI provider
      const agentConfig = (agent.config as Record<string, unknown>) ?? {};
      const result = await provider.chat({
        model: agent.model,
        messages,
        temperature: (agentConfig.temperature as number) ?? 0.7,
        maxTokens: (agentConfig.maxTokens as number) ?? 1024,
      });

      // Log this step
      logs.push({
        agentId: agent.id,
        agentName: agent.name,
        provider: agent.provider,
        model: agent.model,
        input: previousOutput,
        output: result.content,
        usage: result.usage,
      });

      // Pass output to the next agent
      previousOutput = result.content;
    }

    // 4. Mark as COMPLETED
    execution = await prisma.execution.update({
      where: { id: executionId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        result: { output: previousOutput },
        logs,
      },
    });
  } catch (error) {
    // 5. Mark as FAILED on error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[Execution ${executionId}] Failed: ${errorMessage}`);

    execution = await prisma.execution.update({
      where: { id: executionId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        logs: [...logs, { error: errorMessage }],
      },
    });
  }

  return execution;
}

// ─── Cancel ───────────────────────────────────────────────────────

export async function cancelExecution(id: string) {
  const execution = await getExecutionById(id);

  if (execution.status !== 'PENDING' && execution.status !== 'RUNNING') {
    throw ApiError.badRequest('Only PENDING or RUNNING executions can be cancelled');
  }

  return prisma.execution.update({
    where: { id },
    data: { status: 'CANCELLED', completedAt: new Date() },
  });
}

export default {
  createExecution,
  getExecutionsByWorkflow,
  getExecutionById,
  runExecution,
  cancelExecution,
};
