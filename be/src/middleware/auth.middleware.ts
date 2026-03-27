// ===================================================================
// src/middleware/auth.middleware.ts
// ===================================================================
// JWT Authentication & Authorization Middleware
//
// - authenticate(): Verifies Bearer token, attaches userId & role
// - authorize(): Restricts routes to specific roles (e.g. ADMIN)
//
// Token format: Authorization: Bearer <jwt_token>
// ===================================================================

import { Request, Response, NextFunction } from 'express';
import { verifyToken, ApiError, logger } from '../utils';

// ─── Augment Express Request with auth fields ───────────────────

declare global {
  namespace Express {
    interface Request {
      /** Authenticated user's ID (from JWT payload) */
      userId?: string;
      /** Authenticated user's role (from JWT payload) */
      userRole?: string;
    }
  }
}

// ─── authenticate() — Verify JWT ────────────────────────────────

/**
 * Middleware that verifies the JWT token in the Authorization header.
 *
 * On success, attaches `req.userId` and `req.userRole` for use in
 * downstream handlers. On failure, returns 401 Unauthorized.
 *
 * @example
 *   router.get('/profile', authenticate, profileHandler);
 */
export const authenticate = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  try {
    // 1. Extract the Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthorized(
        'Access denied. No token provided. Send: Authorization: Bearer <token>',
      );
    }

    // 2. Extract and verify the token
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    // 3. Attach decoded user info to the request
    req.userId = decoded.userId;
    req.userRole = decoded.role;

    logger.debug(
      `[Auth] Verified user ${decoded.userId} (role: ${decoded.role}) — ${req.method} ${req.path}`,
    );

    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      // Token verification failed (expired, invalid signature, etc.)
      next(ApiError.unauthorized('Invalid or expired token. Please login again.'));
    }
  }
};

// ─── authorize() — Role-based Access Control ────────────────────

/**
 * Middleware factory that restricts access to users with specific roles.
 *
 * Must be used AFTER authenticate() — it reads `req.userRole`.
 *
 * @param allowedRoles  Roles that can access the route (e.g. 'ADMIN').
 *
 * @example
 *   router.delete('/user/:id', authenticate, authorize('ADMIN'), deleteUser);
 */
export const authorize = (...allowedRoles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.userRole || !allowedRoles.includes(req.userRole)) {
      next(
        ApiError.forbidden(
          `Access denied. Required role: ${allowedRoles.join(' or ')}. Your role: ${req.userRole || 'none'}`,
        ),
      );
      return;
    }
    next();
  };
};

export default { authenticate, authorize };
