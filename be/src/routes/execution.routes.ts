// ===================================================================
// src/routes/execution.routes.ts
// ===================================================================
// Execution routes — start workflows, view results, history.
//
// All routes require JWT authentication.
// ===================================================================

import { Router } from 'express';
import * as executionController from '../controllers/execution.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All execution routes require authentication
router.use(authenticate);

/**
 * POST /api/v1/executions/start
 * Body: { workflowId: uuid, input: string }
 * Returns: { executionId, status: 'PENDING' } — 202 Accepted
 *
 * The execution runs asynchronously. Subscribe to Socket.io events
 * for real-time progress updates.
 */
router.post('/start', executionController.startExecution);

/**
 * GET /api/v1/executions/workflow/:workflowId
 * Query: ?page=1&limit=20
 * Returns: { executions, pagination }
 */
router.get('/workflow/:workflowId', executionController.getByWorkflow);

/**
 * GET /api/v1/executions/:id
 * Returns: Full execution record with logs and result
 */
router.get('/:id', executionController.getById);

export default router;
