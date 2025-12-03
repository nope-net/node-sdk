/**
 * NOPE SDK Errors
 *
 * Structured error handling for API interactions.
 */

/**
 * Base error class for all NOPE SDK errors.
 */
export class NopeError extends Error {
  readonly statusCode?: number;
  readonly responseBody?: string;

  constructor(message: string, statusCode?: number, responseBody?: string) {
    super(message);
    this.name = 'NopeError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NopeError);
    }
  }

  override toString(): string {
    if (this.statusCode) {
      return `[${this.statusCode}] ${this.message}`;
    }
    return this.message;
  }
}

/**
 * Authentication error (HTTP 401).
 *
 * Raised when the API key is invalid, expired, or missing.
 */
export class NopeAuthError extends NopeError {
  constructor(message = 'Invalid or missing API key', responseBody?: string) {
    super(message, 401, responseBody);
    this.name = 'NopeAuthError';
  }
}

/**
 * Rate limit exceeded (HTTP 429).
 *
 * Check retryAfter for when to retry.
 */
export class NopeRateLimitError extends NopeError {
  /** Milliseconds until rate limit resets */
  readonly retryAfter?: number;

  constructor(
    message = 'Rate limit exceeded',
    retryAfter?: number,
    responseBody?: string
  ) {
    super(message, 429, responseBody);
    this.name = 'NopeRateLimitError';
    this.retryAfter = retryAfter;
  }

  override toString(): string {
    const base = super.toString();
    if (this.retryAfter) {
      return `${base} (retry after ${this.retryAfter}ms)`;
    }
    return base;
  }
}

/**
 * Validation error (HTTP 400).
 *
 * Raised when the request payload is invalid.
 */
export class NopeValidationError extends NopeError {
  constructor(message = 'Invalid request', responseBody?: string) {
    super(message, 400, responseBody);
    this.name = 'NopeValidationError';
  }
}

/**
 * Server error (HTTP 5xx).
 *
 * Raised when the NOPE API encounters an internal error.
 */
export class NopeServerError extends NopeError {
  constructor(message = 'Server error', statusCode = 500, responseBody?: string) {
    super(message, statusCode, responseBody);
    this.name = 'NopeServerError';
  }
}

/**
 * Connection error.
 *
 * Raised when unable to connect to the NOPE API.
 */
export class NopeConnectionError extends NopeError {
  readonly originalError?: Error;

  constructor(message = 'Failed to connect to NOPE API', originalError?: Error) {
    super(message);
    this.name = 'NopeConnectionError';
    this.originalError = originalError;
  }
}
