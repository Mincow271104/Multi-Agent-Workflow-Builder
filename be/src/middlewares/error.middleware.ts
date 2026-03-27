// ===================================================================
// Error-Handling Middleware
// ===================================================================
// Global error handler — catches ApiErrors and unexpected exceptions,
// returning a consistent JSON response.
// ===================================================================

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../utils';
import { logger } from '../utils';

/**
 * Global Express error handler.
 *
 * Must have 4 parameters so Express recognises it as an error handler.
 */
export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  // ── Zod validation errors ───────────────────────────────────────
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // ── Known operational errors ────────────────────────────────────
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
    return;
  }

  // ── Unexpected / programming errors ─────────────────────────────
  logger.error('Unhandled error:', err);

  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
  });
};
