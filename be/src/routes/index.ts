// ===================================================================
// src/routes/index.ts — Mount all sub-routers under /api/v1
// ===================================================================

import { Router } from 'express';
import authRoutes from './auth.routes';
import workflowRoutes from './workflow.routes';
import agentRoutes from './agent.routes';
import executionRoutes from './execution.routes';

const router = Router();

// ── Mount sub-routers ─────────────────────────────────────────────
router.use('/auth', authRoutes);
router.use('/workflows', workflowRoutes);
router.use('/agents', agentRoutes);
router.use('/executions', executionRoutes);

export default router;
