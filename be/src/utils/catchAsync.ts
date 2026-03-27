// ===================================================================
// Async Error-Catching Wrapper
// ===================================================================
// Wraps async route handlers / controllers so that rejected promises
// are automatically forwarded to Express's error-handling middleware
// instead of causing an unhandled rejection.
// ===================================================================

import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps an async Express handler and catches any thrown errors,
 * forwarding them to `next()`.
 *
 * @example
 *   router.get('/users', catchAsync(async (req, res) => { ... }));
 */
export const catchAsync = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

export default catchAsync;
