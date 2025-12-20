/**
 * NOPE SDK Client
 *
 * Main client for interacting with the NOPE API.
 */

import {
  NopeAuthError,
  NopeConnectionError,
  NopeError,
  NopeRateLimitError,
  NopeServerError,
  NopeValidationError,
} from './errors.js';
import type {
  EvaluateConfig,
  EvaluateOptions,
  EvaluateResponse,
  Message,
  NopeClientOptions,
  ScreenOptions,
  ScreenResponse,
} from './types.js';

const DEFAULT_BASE_URL = 'https://api.nope.net';
const DEFAULT_TIMEOUT = 30000; // milliseconds

/**
 * Client for the NOPE safety API.
 *
 * @example
 * ```typescript
 * import { NopeClient } from '@nope-net/sdk';
 *
 * const client = new NopeClient({ apiKey: 'nope_live_...' });
 * const result = await client.evaluate({
 *   messages: [{ role: 'user', content: 'I feel hopeless' }],
 *   config: { user_country: 'US' }
 * });
 * console.log(result.summary.speaker_severity);
 * ```
 */
export class NopeClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly timeout: number;

  /**
   * Initialize the NOPE client.
   *
   * @param options - Client configuration options
   * @param options.apiKey - Your NOPE API key (starts with 'nope_live_' or 'nope_test_').
   *                         Can be undefined for local development/testing without auth.
   * @param options.baseUrl - Override the API base URL. Defaults to https://api.nope.net
   * @param options.timeout - Request timeout in milliseconds. Defaults to 30000
   */
  constructor(options: NopeClientOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
  }

  /**
   * Evaluate conversation messages for safety risks.
   *
   * Either `messages` or `text` must be provided, but not both.
   *
   * @param options - Evaluation options
   * @param options.messages - List of conversation messages
   * @param options.text - Plain text input (for free-form transcripts)
   * @param options.config - Configuration options including user_country, locale, etc.
   * @param options.userContext - Free-text context about the user
   * @param options.proposedResponse - Optional proposed AI response to evaluate for appropriateness
   *
   * @returns EvaluateResponse with risks, summary, communication, crisis resources, etc.
   *
   * @throws {NopeAuthError} Invalid or missing API key
   * @throws {NopeValidationError} Invalid request payload
   * @throws {NopeRateLimitError} Rate limit exceeded
   * @throws {NopeServerError} Server error
   * @throws {NopeConnectionError} Connection failed
   *
   * @example
   * ```typescript
   * const result = await client.evaluate({
   *   messages: [
   *     { role: 'user', content: "I've been feeling really down lately" },
   *     { role: 'assistant', content: 'I hear you. Can you tell me more?' },
   *     { role: 'user', content: "I just don't see the point anymore" }
   *   ],
   *   config: { user_country: 'US' }
   * });
   *
   * if (result.summary.speaker_severity === 'high' || result.summary.speaker_severity === 'critical') {
   *   console.log('High risk detected');
   *   for (const resource of result.crisis_resources) {
   *     console.log(`  ${resource.name}: ${resource.phone}`);
   *   }
   * }
   * ```
   */
  async evaluate(options: EvaluateOptions): Promise<EvaluateResponse> {
    const { messages, text, config, userContext } = options;

    if (messages === undefined && text === undefined) {
      throw new Error("Either 'messages' or 'text' must be provided");
    }
    if (messages !== undefined && text !== undefined) {
      throw new Error("Only one of 'messages' or 'text' can be provided, not both");
    }

    // Build request payload
    const payload: Record<string, unknown> = {
      config: config ?? {},
    };

    if (messages !== undefined) {
      payload.messages = messages;
    }

    if (text !== undefined) {
      payload.text = text;
    }

    if (userContext !== undefined) {
      payload.user_context = userContext;
    }

    return this.request<EvaluateResponse>('POST', '/v1/evaluate', payload);
  }

  /**
   * Lightweight crisis screening for SB243/regulatory compliance.
   *
   * Fast, cheap endpoint for detecting suicidal ideation and self-harm.
   * Uses C-SSRS framework for evidence-based severity assessment.
   *
   * Either `messages` or `text` must be provided, but not both.
   *
   * @param options - Screen options
   * @param options.messages - List of conversation messages
   * @param options.text - Plain text input (for free-form transcripts)
   * @param options.config - Configuration options (currently only debug flag)
   *
   * @returns ScreenResponse with referral_required, cssrs_level, crisis_type, etc.
   *
   * @throws {NopeAuthError} Invalid or missing API key
   * @throws {NopeValidationError} Invalid request payload
   * @throws {NopeRateLimitError} Rate limit exceeded
   * @throws {NopeServerError} Server error
   * @throws {NopeConnectionError} Connection failed
   *
   * @example
   * ```typescript
   * const result = await client.screen({
   *   text: "I've been having dark thoughts lately"
   * });
   *
   * if (result.referral_required) {
   *   console.log(`Crisis detected: ${result.crisis_type}`);
   *   console.log(`C-SSRS level: ${result.cssrs_level}`);
   *   if (result.resources) {
   *     console.log(`Call ${result.resources.primary.phone}`);
   *   }
   * }
   * ```
   */
  async screen(options: ScreenOptions): Promise<ScreenResponse> {
    const { messages, text, config } = options;

    if (messages === undefined && text === undefined) {
      throw new Error("Either 'messages' or 'text' must be provided");
    }
    if (messages !== undefined && text !== undefined) {
      throw new Error("Only one of 'messages' or 'text' can be provided, not both");
    }

    // Build request payload
    const payload: Record<string, unknown> = {};

    if (messages !== undefined) {
      payload.messages = messages;
    }

    if (text !== undefined) {
      payload.text = text;
    }

    if (config !== undefined) {
      payload.config = config;
    }

    return this.request<ScreenResponse>('POST', '/v1/screen', payload);
  }

  /**
   * Make an HTTP request to the API.
   */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'nope-node/0.1.0',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      return this.handleResponse<T>(response);
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new NopeConnectionError(`Request timed out after ${this.timeout}ms`, error);
        }
        throw new NopeConnectionError(`Failed to connect to ${this.baseUrl}: ${error.message}`, error);
      }
      throw new NopeConnectionError(`Failed to connect to ${this.baseUrl}`);
    }
  }

  /**
   * Handle API response, raising appropriate errors for non-2xx status codes.
   */
  private async handleResponse<T>(response: Response): Promise<T> {
    const responseText = await response.text();

    if (response.ok) {
      try {
        return JSON.parse(responseText) as T;
      } catch {
        throw new NopeError('Invalid JSON response', response.status, responseText);
      }
    }

    // Try to parse error message from response
    let errorMessage: string;
    try {
      const errorData = JSON.parse(responseText) as { error?: string };
      errorMessage = errorData.error ?? responseText;
    } catch {
      errorMessage = responseText;
    }

    if (response.status === 401) {
      throw new NopeAuthError(errorMessage, responseText);
    }

    if (response.status === 400) {
      throw new NopeValidationError(errorMessage, responseText);
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const retryAfterMs = retryAfter ? parseFloat(retryAfter) * 1000 : undefined;
      throw new NopeRateLimitError(errorMessage, retryAfterMs, responseText);
    }

    if (response.status >= 500) {
      throw new NopeServerError(errorMessage, response.status, responseText);
    }

    throw new NopeError(errorMessage, response.status, responseText);
  }
}
