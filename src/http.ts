/**
 * HTTP transport: request building, timeout, retry policy, response meta and
 * error mapping. NopeClient delegates every call here.
 */

import {
  NopeAuthError,
  NopeConnectionError,
  NopeError,
  NopeFeatureError,
  NopeInsufficientBalanceError,
  NopeNotFoundError,
  NopeRateLimitError,
  NopeServerError,
  NopeServiceUnavailableError,
  NopeValidationError,
  type ApiErrorBody,
} from './errors.js';
import { USER_AGENT } from './version.js';

/** Minimal fetch signature the client needs. The global `fetch` satisfies it. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Sleep used between retries. Injectable for tests. */
export type SleepFn = (ms: number) => Promise<void>;

/** Rate-limit and balance headers from the last response. */
export interface ResponseMeta {
  /** HTTP status of the last response. */
  status: number;
  /** From X-RateLimit-Limit / -Remaining / -Reset (reset is epoch ms). Absent when the headers are. */
  rateLimit?: { limit: number; remaining: number; reset: number };
  /** From X-Balance-Mills / X-Cost-Mills. Present only on paid routes. */
  balance?: { balanceMills: number; costMills: number };
}

export interface TransportOptions {
  baseUrl: string;
  apiKey?: string;
  timeout: number;
  maxRetries: number;
  fetch?: FetchLike;
  sleep?: SleepFn;
}

export interface RequestOptions {
  /** JSON body (POST/PUT). */
  body?: unknown;
  /** Query string; undefined values are skipped. */
  query?: Record<string, string | number | boolean | undefined>;
  /** Extra request headers. */
  headers?: Record<string, string>;
  /** Non-2xx statuses returned to the caller instead of raised. */
  acceptStatuses?: number[];
}

export interface RawResult<T> {
  status: number;
  body: T;
}

/** Longest single wait between retries. */
export const MAX_RETRY_WAIT_SECONDS = 30;

const RETRYABLE_STATUSES = new Set([429, 503]);
const CODE_PATTERN = /^[a-z_]+$/;

const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toNumber(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function numberField(body: ApiErrorBody | undefined, key: string): number | undefined {
  const v = body?.[key];
  return typeof v === 'number' ? v : undefined;
}

function stringField(obj: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = obj?.[key];
  return typeof v === 'string' ? v : undefined;
}

/** Parse an error body; undefined when the text is not a JSON object. */
export function parseErrorBody(text: string): ApiErrorBody | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ApiErrorBody;
    }
  } catch {
    // not JSON
  }
  return undefined;
}

/** Retry-After in seconds: header first, then body `retry_after_seconds`. */
export function parseRetryAfter(headers: Headers, body: ApiErrorBody | undefined): number | undefined {
  return toNumber(headers.get('retry-after')) ?? numberField(body, 'retry_after_seconds');
}

/** Build the response meta side-channel from the response headers. */
export function buildResponseMeta(status: number, headers: Headers): ResponseMeta {
  const limit = toNumber(headers.get('x-ratelimit-limit'));
  const balanceMills = toNumber(headers.get('x-balance-mills'));
  return {
    status,
    rateLimit:
      limit === undefined
        ? undefined
        : {
            limit,
            remaining: toNumber(headers.get('x-ratelimit-remaining')) ?? 0,
            reset: toNumber(headers.get('x-ratelimit-reset')) ?? 0,
          },
    balance:
      balanceMills === undefined
        ? undefined
        : { balanceMills, costMills: toNumber(headers.get('x-cost-mills')) ?? 0 },
  };
}

/** Map a non-2xx response to the SDK error class for its status. */
export function mapErrorResponse(status: number, statusText: string, headers: Headers, text: string): NopeError {
  const body = parseErrorBody(text);
  const errorField = typeof body?.error === 'string' ? body.error : undefined;
  // An explicit machine code wins (Oversight validation bodies send {error: sentence, code});
  // otherwise `error` is the code only when it looks like one.
  const explicitCode = stringField(body, 'code');
  const code = explicitCode || (errorField && CODE_PATTERN.test(errorField) ? errorField : undefined);
  const message =
    (typeof body?.message === 'string' ? body.message : undefined) ??
    errorField ??
    (text || statusText || `HTTP ${status}`);
  const base = { code, responseBody: text, body };

  switch (status) {
    case 400:
    case 413: {
      const details: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(body ?? {})) {
        if (k !== 'error' && k !== 'message' && k !== 'code') details[k] = v;
      }
      return new NopeValidationError(message, { ...base, statusCode: status, details });
    }
    case 401:
      return new NopeAuthError(message, base);
    case 402: {
      const balance = (body?.balance ?? {}) as Record<string, unknown>;
      const num = (k: string) => (typeof balance[k] === 'number' ? (balance[k] as number) : undefined);
      return new NopeInsufficientBalanceError(message, {
        ...base,
        balanceMills: num('current_mills'),
        requiredMills: num('required_mills'),
        formattedCurrent: stringField(balance, 'formatted_current'),
        formattedRequired: stringField(balance, 'formatted_required'),
        topupUrl: stringField(body, 'topup_url'),
        perConversationMills: num('per_conversation_mills'),
        conversations: num('conversations'),
      });
    }
    case 403: {
      const feature = stringField(body, 'feature');
      const upgradeUrl = stringField(body, 'upgrade_url');
      if (feature) {
        return new NopeFeatureError(message, {
          ...base,
          feature,
          requiredAccess: stringField(body, 'required_access'),
          upgradeUrl,
        });
      }
      if (upgradeUrl) {
        return new NopeFeatureError(message, { ...base, feature: 'paid_plan', upgradeUrl });
      }
      return new NopeError(message, { ...base, statusCode: 403 });
    }
    case 404:
      return new NopeNotFoundError(message, base);
    case 429:
      return new NopeRateLimitError(message, {
        ...base,
        retryAfter: parseRetryAfter(headers, body),
        limit: numberField(body, 'limit') ?? toNumber(headers.get('x-ratelimit-limit')),
        remaining: numberField(body, 'remaining') ?? toNumber(headers.get('x-ratelimit-remaining')),
        reset: numberField(body, 'reset') ?? toNumber(headers.get('x-ratelimit-reset')),
      });
    case 503:
      return new NopeServiceUnavailableError(message, { ...base, retryAfter: parseRetryAfter(headers, body) });
    default:
      if (status >= 500) {
        return new NopeServerError(message, {
          ...base,
          statusCode: status,
          retryAfter: toNumber(headers.get('retry-after')),
        });
      }
      return new NopeError(message, { ...base, statusCode: status });
  }
}

export class Transport {
  readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: SleepFn;

  /** Rate-limit and balance headers from the most recent response. */
  lastResponseMeta?: ResponseMeta;

  constructor(options: TransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.timeout = options.timeout;
    this.maxRetries = Math.max(0, options.maxRetries);
    // Resolve the global lazily so a fetch polyfill installed after import still works.
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.sleep = options.sleep ?? defaultSleep;
  }

  /** Perform a request and return the parsed JSON body. */
  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const result = await this.requestRaw<T>(method, path, options);
    return result.body;
  }

  /** Perform a request and return status plus parsed body (for accepted non-2xx statuses). */
  async requestRaw<T>(method: string, path: string, options: RequestOptions = {}): Promise<RawResult<T>> {
    const url = this.buildUrl(path, options.query);
    const headers: Record<string, string> = {
      'User-Agent': USER_AGENT,
      ...(options.headers ?? {}),
    };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;
    const body = options.body === undefined ? undefined : JSON.stringify(options.body);
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const accept = new Set(options.acceptStatuses ?? []);

    for (let attempt = 0; ; attempt++) {
      const response = await this.send(url, { method, headers, body });
      const text = await response.text();
      this.lastResponseMeta = buildResponseMeta(response.status, response.headers);

      if (response.ok || accept.has(response.status)) {
        try {
          return { status: response.status, body: JSON.parse(text) as T };
        } catch {
          throw new NopeError('Invalid JSON response', { statusCode: response.status, responseBody: text });
        }
      }

      if (RETRYABLE_STATUSES.has(response.status) && attempt < this.maxRetries) {
        const hinted = parseRetryAfter(response.headers, parseErrorBody(text));
        const waitSeconds = Math.min(hinted ?? 2 ** attempt, MAX_RETRY_WAIT_SECONDS);
        await this.sleep(waitSeconds * 1000);
        continue;
      }

      throw mapErrorResponse(response.status, response.statusText, response.headers, text);
    }
  }

  private buildUrl(path: string, query?: RequestOptions['query']): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined) params.set(k, String(v));
    }
    const qs = params.toString();
    return `${this.baseUrl}${path}${qs ? `?${qs}` : ''}`;
  }

  private async send(url: string, init: { method: string; headers: Record<string, string>; body?: string }): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new NopeConnectionError(`Request timed out after ${this.timeout}ms`, error);
        }
        throw new NopeConnectionError(`Failed to connect to ${this.baseUrl}: ${error.message}`, error);
      }
      throw new NopeConnectionError(`Failed to connect to ${this.baseUrl}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
