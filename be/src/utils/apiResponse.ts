// ===================================================================
// Standardized API Response Helper
// ===================================================================
// Wraps every successful response in a consistent JSON envelope:
// { success: true, message: "...", data: { ... } }
// ===================================================================

import { Response } from 'express';

interface ApiResponseOptions<T> {
  res: Response;
  statusCode?: number;
  message?: string;
  data?: T;
}

/**
 * Send a standardized JSON response.
 *
 * @example
 *   apiResponse({ res, statusCode: 201, message: 'Created', data: user });
 */
export function apiResponse<T>({
  res,
  statusCode = 200,
  message = 'Success',
  data,
}: ApiResponseOptions<T>): void {
  res.status(statusCode).json({
    success: true,
    message,
    data: data ?? null,
  });
}

export default apiResponse;
