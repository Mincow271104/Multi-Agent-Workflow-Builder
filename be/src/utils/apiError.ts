// ===================================================================
// Custom API Error Class
// ===================================================================
// Extends the native Error to carry an HTTP status code so that the
// global error handler can return the correct response.
// ===================================================================

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  /**
   * @param statusCode  HTTP status code (e.g. 400, 404, 500)
   * @param message     Human-readable error message
   * @param isOperational  If true the error is expected/operational,
   *                       if false it indicates a programming bug.
   */
  constructor(statusCode: number, message: string, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, ApiError.prototype);

    // Capture stack trace (V8 only)
    Error.captureStackTrace(this, this.constructor);
  }

  // ── Factory helpers ───────────────────────────────────────────

  static badRequest(message = 'Bad Request') {
    return new ApiError(400, message);
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Not Found') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Conflict') {
    return new ApiError(409, message);
  }

  static internal(message = 'Internal Server Error') {
    return new ApiError(500, message, false);
  }
}

export default ApiError;
