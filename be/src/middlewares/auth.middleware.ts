// ===================================================================
// Auth Middleware
// ===================================================================
// Verifies the JWT token from the Authorization header and attaches
// the decoded userId and role to the request object.
// ===================================================================

import { Request, Response, NextFunction } from 'express';
import { verifyToken, ApiError } from '../utils';

/**
 * Augment the Express Request type with auth fields.
 */
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userRole?: string;
    }
  }
}

/**
 * Middleware that requires a valid JWT in the Authorization header.
 *
 * Expected format: `Authorization: Bearer <token>`
 */
export const authenticate = (req: Request, _res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthorized('No token provided');
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    // Attach user info to the request for downstream handlers
    req.userId = decoded.userId;
    req.userRole = decoded.role;

    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      next(ApiError.unauthorized('Invalid or expired token'));
    }
  }
};

/**
 * Middleware that restricts access to specific roles.
 *
 * @param roles  Allowed roles (e.g. 'ADMIN').
 */
export const authorize = (...roles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      next(ApiError.forbidden('Insufficient permissions'));
      return;
    }
    next();
  };
};
