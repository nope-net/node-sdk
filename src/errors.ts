/**
 * NOPE SDK errors.
 *
 * Every error carries `statusCode` (HTTP status; absent for connection
 * failures and for requests the SDK rejected before sending), `code` (the
 * API's machine string when the body's `error` field looks like one, e.g.
 * `insufficient_balance`; `invalid_request` or `not_available_in_demo` for
 * client-side rejections), `message` (the API's human sentence when present),
 * `responseBody` (the raw response text) and `body` (the parsed JSON object
 * when the response was one).
 */

/**
 * Shape of a NOPE API error body. `error` is either a machine code
 * (`rate_limit_exceeded`) or a sentence; `message` carries the sentence when
 * `error` is a code. Any other keys are endpoint-specific extras
 * (`max_bytes`, `invalid_scopes`, `balance`, `upgrade_url`, ...).
 */
export interface ApiErrorBody {
  error: string;
  message?: string;
  [key: string]: unknown;
}

export interface NopeErrorOptions {
  /** HTTP status of the response. */
  statusCode?: number;
  /** Machine code from the body's `error` field, when it is one. */
  code?: string;
  /** Raw response body text. */
  responseBody?: string;
  /** Parsed response body, when the text was a JSON object. */
  body?: ApiErrorBody;
}

/**
 * Base class for all NOPE SDK errors.
 */
export class NopeError extends Error {
  readonly statusCode?: number;
  readonly code?: string;
  /** Raw response body text. Absent when no response was received. */
  readonly responseBody?: string;
  /**
   * The response body parsed as JSON, when it was a JSON object. Absent for
   * non-JSON bodies, for connection failures and for client-side
   * rejections. `responseBody` keeps the raw text either way.
   */
  readonly body?: ApiErrorBody;

  constructor(message: string, options: NopeErrorOptions = {}) {
    super(message);
    this.name = 'NopeError';
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.responseBody = options.responseBody;
    this.body = options.body;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, new.target);
    }
  }

  override toString(): string {
    return this.statusCode ? `[${this.statusCode}] ${this.message}` : this.message;
  }
}

/**
 * Authentication failed (HTTP 401): the API key is missing, malformed,
 * revoked, or unknown.
 */
export class NopeAuthError extends NopeError {
  constructor(message = 'Invalid or missing API key', options: Omit<NopeErrorOptions, 'statusCode'> = {}) {
    super(message, { ...options, statusCode: 401 });
    this.name = 'NopeAuthError';
  }
}

export interface NopeValidationErrorOptions extends NopeErrorOptions {
  /** Endpoint-specific extras from the body (everything except `error` and `message`). */
  details?: Record<string, unknown>;
}

/**
 * The request was rejected. Three sources:
 *
 * - HTTP 400 (invalid request) or 413 (body over the 512 KB limit):
 *   `statusCode` is the status and `details` carries the body's extra keys,
 *   for example `max_bytes`, `max_messages`, `max_content_length`,
 *   `invalid_scopes`, `hint`, `details`.
 * - Client-side validation (an empty `messages` array, a role other than
 *   `user` or `assistant`, more than 100 messages, neither `messages` nor
 *   `text`, and the other checks each method documents): thrown before any
 *   request is sent, so `statusCode` is undefined; `code` is
 *   `'invalid_request'` and `details` is empty.
 * - A method refused on a demo client: also thrown before any request,
 *   `statusCode` undefined, `code` `'not_available_in_demo'`.
 */
export class NopeValidationError extends NopeError {
  readonly details: Record<string, unknown>;

  constructor(message = 'Invalid request', options: NopeValidationErrorOptions = {}) {
    const { details, ...rest } = options;
    // 400 unless the caller names a status. Client-side rejections pass
    // `statusCode: undefined` on purpose: there was no response.
    super(message, { ...rest, statusCode: 'statusCode' in options ? options.statusCode : 400 });
    this.name = 'NopeValidationError';
    this.details = details ?? {};
  }
}

export interface NopeInsufficientBalanceErrorOptions extends Omit<NopeErrorOptions, 'statusCode'> {
  balanceMills?: number;
  requiredMills?: number;
  formattedCurrent?: string;
  formattedRequired?: string;
  topupUrl?: string;
  /** Oversight ingest only: cost per conversation. */
  perConversationMills?: number;
  /** Oversight ingest only: number of conversations in the rejected batch. */
  conversations?: number;
}

/**
 * The account balance cannot cover the call (HTTP 402). Top up at `topupUrl`.
 */
export class NopeInsufficientBalanceError extends NopeError {
  readonly balanceMills?: number;
  readonly requiredMills?: number;
  readonly formattedCurrent?: string;
  readonly formattedRequired?: string;
  readonly topupUrl?: string;
  readonly perConversationMills?: number;
  readonly conversations?: number;

  constructor(message = 'Insufficient balance', options: NopeInsufficientBalanceErrorOptions = {}) {
    const {
      balanceMills,
      requiredMills,
      formattedCurrent,
      formattedRequired,
      topupUrl,
      perConversationMills,
      conversations,
      ...rest
    } = options;
    super(message, { ...rest, statusCode: 402 });
    this.name = 'NopeInsufficientBalanceError';
    this.balanceMills = balanceMills;
    this.requiredMills = requiredMills;
    this.formattedCurrent = formattedCurrent;
    this.formattedRequired = formattedRequired;
    this.topupUrl = topupUrl;
    this.perConversationMills = perConversationMills;
    this.conversations = conversations;
  }
}

export interface NopeFeatureErrorOptions extends Omit<NopeErrorOptions, 'statusCode'> {
  feature?: string;
  requiredAccess?: string;
  upgradeUrl?: string;
}

/**
 * The account lacks access to a feature (HTTP 403).
 *
 * Two shapes on the wire: a gated feature (`feature`, `requiredAccess`; for
 * example Oversight) and a paid-plan gate (`feature` is `'paid_plan'` and
 * `upgradeUrl` points at the dashboard).
 */
export class NopeFeatureError extends NopeError {
  readonly feature?: string;
  readonly requiredAccess?: string;
  readonly upgradeUrl?: string;

  constructor(message = 'Feature not enabled for this account', options: NopeFeatureErrorOptions = {}) {
    const { feature, requiredAccess, upgradeUrl, ...rest } = options;
    super(message, { ...rest, statusCode: 403 });
    this.name = 'NopeFeatureError';
    this.feature = feature;
    this.requiredAccess = requiredAccess;
    this.upgradeUrl = upgradeUrl;
  }

  override toString(): string {
    const base = super.toString();
    return this.feature ? `${base} (feature: ${this.feature})` : base;
  }
}

/**
 * The resource does not exist (HTTP 404): an unknown signpost id or webhook id.
 */
export class NopeNotFoundError extends NopeError {
  constructor(message = 'Not found', options: Omit<NopeErrorOptions, 'statusCode'> = {}) {
    super(message, { ...options, statusCode: 404 });
    this.name = 'NopeNotFoundError';
  }
}

export interface NopeRateLimitErrorOptions extends Omit<NopeErrorOptions, 'statusCode'> {
  retryAfter?: number;
  limit?: number;
  remaining?: number;
  reset?: number;
}

/**
 * Rate limit exceeded (HTTP 429).
 *
 * `retryAfter` is in seconds (from the `Retry-After` header, else the body's
 * `retry_after_seconds`). The client retries 429s itself up to `maxRetries`
 * before raising this.
 */
export class NopeRateLimitError extends NopeError {
  /** Seconds until the limit resets. */
  readonly retryAfter?: number;
  /** Requests allowed per window. */
  readonly limit?: number;
  /** Requests left in the window (0 when rate limited). */
  readonly remaining?: number;
  /** Window reset time as epoch milliseconds. */
  readonly reset?: number;

  constructor(message = 'Rate limit exceeded', options: NopeRateLimitErrorOptions = {}) {
    const { retryAfter, limit, remaining, reset, ...rest } = options;
    super(message, { ...rest, statusCode: 429 });
    this.name = 'NopeRateLimitError';
    this.retryAfter = retryAfter;
    this.limit = limit;
    this.remaining = remaining;
    this.reset = reset;
  }

  override toString(): string {
    const base = super.toString();
    return this.retryAfter !== undefined ? `${base} (retry after ${this.retryAfter}s)` : base;
  }
}

export interface NopeServerErrorOptions extends NopeErrorOptions {
  /** Seconds suggested by a `Retry-After` header, when one was sent. */
  retryAfter?: number;
}

/**
 * The API failed (HTTP 5xx other than 503). Not retried by the client: paid
 * routes charge before the handler runs, so a blind retry could double-bill.
 */
export class NopeServerError extends NopeError {
  readonly retryAfter?: number;

  constructor(message = 'Server error', options: NopeServerErrorOptions = {}) {
    const { retryAfter, ...rest } = options;
    super(message, { statusCode: 500, ...rest });
    this.name = 'NopeServerError';
    this.retryAfter = retryAfter;
  }
}

/**
 * A dependency or provider is temporarily unavailable (HTTP 503).
 *
 * Retryable: the client retries 503s itself up to `maxRetries`, waiting
 * `retryAfter` seconds, before raising this.
 */
export class NopeServiceUnavailableError extends NopeServerError {
  constructor(message = 'Service unavailable', options: Omit<NopeServerErrorOptions, 'statusCode'> = {}) {
    super(message, { ...options, statusCode: 503 });
    this.name = 'NopeServiceUnavailableError';
  }
}

/**
 * The request never produced a response: DNS, TCP, TLS failure, or the
 * client-side timeout. Not retried by the client (see NopeServerError).
 */
export class NopeConnectionError extends NopeError {
  readonly originalError?: Error;

  constructor(message = 'Failed to connect to NOPE API', originalError?: Error) {
    super(message);
    this.name = 'NopeConnectionError';
    this.originalError = originalError;
  }
}
