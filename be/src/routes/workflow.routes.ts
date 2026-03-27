// ===================================================================
// src/routes/workflow.routes.ts
// ===================================================================
// Workflow CRUD routes — all require JWT authentication.
// ===================================================================

import { Router } from 'express';
import * as workflowController from '../controllers/workflow.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All workflow routes require authentication
router.use(authenticate);

/** POST   /api/v1/workflows         — Create a new workflow */
router.post('/', workflowController.create);

/** GET    /api/v1/workflows         — List all user workflows */
router.get('/', workflowController.getAll);

/** GET    /api/v1/workflows/:id     — Get workflow with agents & executions */
router.get('/:id', workflowController.getById);

/** PUT    /api/v1/workflows/:id     — Update workflow */
router.put('/:id', workflowController.update);

/** DELETE /api/v1/workflows/:id     — Delete workflow (cascades) */
router.delete('/:id', workflowController.remove);

export default router;
