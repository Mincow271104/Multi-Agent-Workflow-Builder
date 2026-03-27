// ===================================================================
// src/routes/auth.routes.ts
// ===================================================================
// Authentication routes — register, login, and protected profile.
// ===================================================================

import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

/**
 * POST /api/v1/auth/register
 * Body: { email: string, name: string, password: string }
 * Returns: { user, token }
 */
router.post('/register', authController.register);

/**
 * POST /api/v1/auth/login
 * Body: { email: string, password: string }
 * Returns: { user, token }
 */
router.post('/login', authController.login);

/**
 * GET /api/v1/auth/me
 * Headers: Authorization: Bearer <token>
 * Returns: { user }
 */
router.get('/me', authenticate, authController.getMe);

export default router;
