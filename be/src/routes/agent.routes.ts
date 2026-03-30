// ===================================================================
// Agent Routes
// ===================================================================

import { Router } from 'express';
import * as agentController from '../controllers/agent.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

// All agent routes require authentication
router.use(authenticate);

/** POST   /api/v1/agents/generate-prompt         — Auto-generate a system prompt */
router.post('/generate-prompt', agentController.generatePrompt);

/** POST   /api/v1/agents                        — Create an agent        */
router.post('/', agentController.create);

/** GET    /api/v1/agents/workflow/:workflowId    — List agents by workflow */
router.get('/workflow/:workflowId', agentController.getByWorkflow);

/** GET    /api/v1/agents/:id                     — Get a single agent     */
router.get('/:id', agentController.getById);

/** PUT    /api/v1/agents/:id                     — Update an agent        */
router.put('/:id', agentController.update);

/** DELETE /api/v1/agents/:id                     — Delete an agent        */
router.delete('/:id', agentController.remove);

export default router;
