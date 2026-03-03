/**
 * NOPE SDK Client
 *
 * Main client for interacting with the NOPE API.
 */

import {
  NopeAuthError,
  NopeConnectionError,
  NopeError,
  NopeFeatureError,
  NopeRateLimitError,
  NopeServerError,
  NopeValidationError,
} from './errors.js';
import type {
  DetectCountryResponse,
  EvaluateConfig,
  EvaluateOptions,
  EvaluateResponse,
  Message,
  NopeClientOptions,
  OversightAnalyzeOptions,
  OversightAnalyzeResponse,
  OversightIngestOptions,
  OversightIngestResponse,
  ResourceByIdResponse,
  ResourcesConfig,
  ResourcesCountriesResponse,
  ResourcesOptions,
  ResourcesResponse,
  ResourcesSmartOptions,
  ResourcesSmartResponse,
  ScreenOptions,
  ScreenResponse,
  SignpostByIdResponse,
  SignpostConfig,
  SignpostCountriesResponse,
  SignpostOptions,
  SignpostResponse,
  SignpostSmartOptions,
  SignpostSmartResponse,
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
 * console.log(result.speaker_severity);
 * ```
 */
export class NopeClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly demo: boolean;

  /**
   * Initialize the NOPE client.
   *
   * @param options - Client configuration options
   * @param options.apiKey - Your NOPE API key (starts with 'nope_live_' or 'nope_test_').
   *                         Can be undefined for local development/testing without auth.
   * @param options.baseUrl - Override the API base URL. Defaults to https://api.nope.net
   * @param options.timeout - Request timeout in milliseconds. Defaults to 30000
   * @param options.demo - Use demo/try endpoints that don't require authentication
   */
  constructor(options: NopeClientOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.demo = options.demo ?? false;
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
   * @returns EvaluateResponse with risks, speaker_severity, rationale, resources, etc.
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
   * if (result.speaker_severity === 'high' || result.speaker_severity === 'critical') {
   *   console.log('High risk detected');
   *   if (result.resources?.primary) {
   *     console.log(`  ${result.resources.primary.name}: ${result.resources.primary.phone}`);
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

    // Build request payload — normalize config for v1 API compatibility
    const normalizedConfig: Record<string, unknown> = { ...(config ?? {}) };

    // Map deprecated user_country → country for v1 API
    if (normalizedConfig.user_country && !normalizedConfig.country) {
      normalizedConfig.country = normalizedConfig.user_country;
    }

    const payload: Record<string, unknown> = {
      config: normalizedConfig,
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

    const endpoint = this.demo ? '/v1/try/evaluate' : '/v1/evaluate';
    return this.request<EvaluateResponse>('POST', endpoint, payload);
  }

  /**
   * Lightweight crisis screening for SB243/regulatory compliance.
   *
   * @deprecated Use `evaluate()` instead. The screen endpoint has been consolidated
   * into evaluate, which now uses Edge-backed classification at $0.003/call.
   * This method calls the legacy `/v0/screen` endpoint ($0.001/call).
   *
   * Fast, cheap endpoint for detecting suicidal ideation and self-harm.
   * Returns independent detection flags, tuned conservatively for compliance.
   *
   * Either `messages` or `text` must be provided, but not both.
   *
   * @param options - Screen options
   * @param options.messages - List of conversation messages
   * @param options.text - Plain text input (for free-form transcripts)
   * @param options.config - Configuration options (currently only debug flag)
   *
   * @returns ScreenResponse with show_resources, suicidal_ideation, self_harm flags
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
   * if (result.show_resources) {
   *   console.log(`SI: ${result.suicidal_ideation}, SH: ${result.self_harm}`);
   *   console.log(`Rationale: ${result.rationale}`);
   *   if (result.resources) {
   *     console.log(`Call ${result.resources.primary.phone}`);
   *   }
   * }
   * ```
   */
  async screen(options: ScreenOptions): Promise<ScreenResponse> {
    console.warn(
      '[NOPE SDK] screen() is deprecated. Use evaluate() instead, which now provides ' +
        'Edge-backed classification at $0.003/call. screen() calls the legacy /v0/screen endpoint.'
    );

    if (this.demo) {
      throw new Error(
        'screen() is not available in demo mode. Use evaluate() instead — ' +
          'it uses the same Edge-backed classification and is available via /v1/try/evaluate.'
      );
    }

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

    // Legacy v0 endpoint (requires authentication)
    return this.request<ScreenResponse>('POST', '/v0/screen', payload);
  }

  /**
   * Oversight API namespace for AI behavior analysis.
   *
   * Oversight analyzes AI assistant conversations to detect harmful behaviors
   * that content moderation APIs can't catch because they require conversational context.
   *
   * @example
   * ```typescript
   * // Single conversation analysis
   * const result = await client.oversight.analyze({
   *   conversation: {
   *     messages: [
   *       { role: 'user', content: 'I feel so alone' },
   *       { role: 'assistant', content: 'I understand. I\'m always here for you.' }
   *     ]
   *   }
   * });
   *
   * if (result.result.overall_concern === 'high') {
   *   console.log('Concerning behaviors:', result.result.detected_behaviors);
   * }
   * ```
   */
  readonly oversight = {
    /**
     * Analyze a single conversation for harmful AI behaviors.
     *
     * This endpoint performs synchronous analysis and returns results directly.
     * Does NOT store results to database - use `ingest` for persistent storage.
     *
     * @param options - Analysis options
     * @param options.conversation - The conversation to analyze
     * @param options.config - Configuration options (strategy, model, etc.)
     *
     * @returns Analysis result with detected behaviors, concern level, and trajectory
     *
     * @throws {NopeFeatureError} Oversight feature not enabled for this account (403)
     * @throws {NopeAuthError} Invalid or missing API key (401)
     * @throws {NopeValidationError} Invalid request payload (400)
     * @throws {NopeServerError} Server error (5xx)
     *
     * @example
     * ```typescript
     * const result = await client.oversight.analyze({
     *   conversation: {
     *     conversation_id: 'conv_123',
     *     messages: [
     *       { role: 'user', content: 'I want to end it all' },
     *       { role: 'assistant', content: 'I understand how you feel...' }
     *     ],
     *     metadata: { user_is_minor: true }
     *   },
     *   config: { strategy: 'sliding' }
     * });
     *
     * console.log(`Concern: ${result.result.overall_concern}`);
     * console.log(`Trajectory: ${result.result.trajectory}`);
     * for (const behavior of result.result.detected_behaviors) {
     *   console.log(`  ${behavior.code}: ${behavior.severity}`);
     * }
     * ```
     */
    analyze: async (options: OversightAnalyzeOptions): Promise<OversightAnalyzeResponse> => {
      const { conversation, config } = options;

      if (!conversation) {
        throw new Error('"conversation" is required');
      }

      if (!conversation.messages || !Array.isArray(conversation.messages)) {
        throw new Error('"conversation.messages" must be an array');
      }

      if (conversation.messages.length === 0) {
        throw new Error('"conversation.messages" cannot be empty');
      }

      const payload: Record<string, unknown> = {
        conversation: {
          conversation_id: conversation.conversation_id,
          messages: conversation.messages,
          metadata: conversation.metadata,
        },
      };

      if (config) {
        payload.config = config;
      }

      const endpoint = this.demo ? '/v1/try/oversight/analyze' : '/v1/oversight/analyze';
      return this.request<OversightAnalyzeResponse>('POST', endpoint, payload);
    },

    /**
     * Ingest multiple conversations for batch analysis with database storage.
     *
     * Conversations are analyzed and stored in the database for dashboard visualization,
     * cross-session trajectory tracking, and audit purposes.
     *
     * Note: This endpoint is NOT available in demo mode. Requires API key with
     * Oversight feature enabled.
     *
     * @param options - Ingest options
     * @param options.conversations - Array of conversations to analyze (max 100)
     * @param options.webhook_url - Optional URL to notify when ingestion completes
     * @param options.config - Configuration options (model)
     *
     * @returns Ingestion status with per-conversation results
     *
     * @throws {NopeFeatureError} Oversight feature not enabled for this account (403)
     * @throws {NopeAuthError} Invalid or missing API key (401)
     * @throws {NopeValidationError} Invalid request payload (400)
     * @throws {NopeServerError} Server error (5xx)
     *
     * @example
     * ```typescript
     * const result = await client.oversight.ingest({
     *   conversations: [
     *     {
     *       conversation_id: 'conv_001',
     *       messages: [...],
     *       metadata: { user_id_hash: 'abc123', platform: 'ios' }
     *     },
     *     {
     *       conversation_id: 'conv_002',
     *       messages: [...],
     *     }
     *   ],
     *   webhook_url: 'https://api.example.com/webhooks/nope'
     * });
     *
     * console.log(`Ingestion ID: ${result.ingestion_id}`);
     * console.log(`Processed: ${result.conversations_processed}/${result.conversations_received}`);
     * console.log(`Dashboard: ${result.dashboard_url}`);
     * ```
     */
    ingest: async (options: OversightIngestOptions): Promise<OversightIngestResponse> => {
      if (this.demo) {
        throw new Error('Oversight ingest is not available in demo mode. Use an API key.');
      }

      const { conversations, webhook_url, config } = options;

      if (!conversations || !Array.isArray(conversations)) {
        throw new Error('"conversations" must be an array');
      }

      if (conversations.length === 0) {
        throw new Error('"conversations" array cannot be empty');
      }

      if (conversations.length > 100) {
        throw new Error(`Too many conversations: ${conversations.length}. Maximum allowed: 100`);
      }

      // Validate each conversation has conversation_id
      for (let i = 0; i < conversations.length; i++) {
        const conv = conversations[i];
        if (!conv.conversation_id) {
          throw new Error(`Conversation at index ${i} must have a "conversation_id"`);
        }
        if (!conv.messages || conv.messages.length === 0) {
          throw new Error(`Conversation "${conv.conversation_id}" must have non-empty "messages"`);
        }
      }

      const payload: Record<string, unknown> = {
        conversations,
      };

      if (webhook_url) {
        payload.webhook_url = webhook_url;
      }

      if (config) {
        payload.config = config;
      }

      return this.request<OversightIngestResponse>('POST', '/v1/oversight/ingest', payload);
    },
  };

  // ===========================================================================
  // Signpost Methods (canonical crisis resources endpoints)
  // ===========================================================================

  /**
   * Get crisis resources for a country.
   *
   * This is the basic lookup endpoint (free, no LLM). For AI-ranked results,
   * use `signpostSmart()` instead.
   *
   * @param options - Signpost options
   * @param options.country - ISO country code (e.g., "US", "GB")
   * @param options.config - Optional filtering configuration (scopes, populations, limit, urgent)
   *
   * @returns SignpostResponse with crisis resources for the country
   *
   * @throws {NopeAuthError} Invalid or missing API key
   * @throws {NopeValidationError} Invalid request payload
   * @throws {NopeRateLimitError} Rate limit exceeded
   * @throws {NopeServerError} Server error
   * @throws {NopeConnectionError} Connection failed
   *
   * @example
   * ```typescript
   * const result = await client.signpost({ country: 'US' });
   * for (const resource of result.resources) {
   *   console.log(`${resource.name}: ${resource.phone}`);
   * }
   *
   * // With filtering
   * const filtered = await client.signpost({
   *   country: 'US',
   *   config: { scopes: ['suicide_prevention'], urgent: true }
   * });
   * ```
   */
  async signpost(options: SignpostOptions): Promise<SignpostResponse> {
    const { country, config } = options;

    // Build query string
    const params = new URLSearchParams();
    params.set('country', country.toUpperCase());

    if (config) {
      if (config.scopes?.length) {
        params.set('scopes', config.scopes.join(','));
      }
      if (config.populations?.length) {
        params.set('populations', config.populations.join(','));
      }
      if (config.limit !== undefined) {
        params.set('limit', config.limit.toString());
      }
      if (config.urgent) {
        params.set('urgent', 'true');
      }
    }

    return this.requestGet<SignpostResponse>(`/v1/signpost?${params.toString()}`);
  }

  /**
   * Get AI-ranked crisis resources based on a semantic query.
   *
   * Uses LLM ranking to find the most relevant crisis resources. Costs $0.001 per call.
   *
   * @param options - Smart signpost options
   * @param options.country - ISO country code (e.g., "US", "GB")
   * @param options.query - Natural language query (max 500 chars)
   * @param options.config - Optional filtering configuration (scopes, populations, limit)
   *
   * @returns SignpostSmartResponse with resources ranked by relevance
   *
   * @throws {NopeAuthError} Invalid or missing API key
   * @throws {NopeValidationError} Invalid request payload
   * @throws {NopeRateLimitError} Rate limit exceeded
   * @throws {NopeServerError} Server error
   * @throws {NopeConnectionError} Connection failed
   *
   * @example
   * ```typescript
   * const result = await client.signpostSmart({
   *   country: 'US',
   *   query: 'teen struggling with eating disorder'
   * });
   * for (const ranked of result.ranked) {
   *   console.log(`${ranked.resource.name} (score: ${ranked.score})`);
   *   console.log(`  ${ranked.reasoning}`);
   * }
   * ```
   */
  async signpostSmart(options: SignpostSmartOptions): Promise<SignpostSmartResponse> {
    const { country, query, config } = options;

    // Build query string
    const params = new URLSearchParams();
    params.set('country', country.toUpperCase());
    params.set('query', query);

    if (config) {
      if (config.scopes?.length) {
        params.set('scopes', config.scopes.join(','));
      }
      if (config.populations?.length) {
        params.set('populations', config.populations.join(','));
      }
      if (config.limit !== undefined) {
        params.set('limit', config.limit.toString());
      }
    }

    const endpoint = this.demo ? '/v1/try/signpost/smart' : '/v1/signpost/smart';
    return this.requestGet<SignpostSmartResponse>(`${endpoint}?${params.toString()}`);
  }

  /**
   * Get a single crisis resource by its database ID.
   *
   * This is a public endpoint (no auth required).
   *
   * @param resourceId - UUID of the resource
   *
   * @returns SignpostByIdResponse with the crisis resource
   *
   * @throws {NopeValidationError} Invalid resource ID format
   * @throws {NopeServerError} Server error
   * @throws {NopeConnectionError} Connection failed
   *
   * @example
   * ```typescript
   * const result = await client.signpostById('550e8400-e29b-41d4-a716-446655440000');
   * console.log(`${result.resource.name}: ${result.resource.phone}`);
   * ```
   */
  async signpostById(resourceId: string): Promise<SignpostByIdResponse> {
    return this.requestGet<SignpostByIdResponse>(`/v1/signpost/${resourceId}`);
  }

  /**
   * List all countries with available crisis resources.
   *
   * This is a public endpoint (no auth required).
   *
   * @returns SignpostCountriesResponse with list of supported country codes
   *
   * @throws {NopeServerError} Server error
   * @throws {NopeConnectionError} Connection failed
   *
   * @example
   * ```typescript
   * const result = await client.signpostCountries();
   * console.log(`Supported countries: ${result.countries.join(', ')}`);
   * ```
   */
  async signpostCountries(): Promise<SignpostCountriesResponse> {
    return this.requestGet<SignpostCountriesResponse>('/v1/signpost/countries');
  }

  /**
   * Detect user's country from request headers.
   *
   * Uses geo headers (Cloudflare, Netlify) to determine country.
   * This is a public endpoint (no auth required).
   *
   * @returns DetectCountryResponse with detected country code and name
   *
   * @throws {NopeServerError} Server error
   * @throws {NopeConnectionError} Connection failed
   *
   * @example
   * ```typescript
   * const result = await client.detectCountry();
   * if (result.country_code) {
   *   console.log(`Detected: ${result.country_name} (${result.country_code})`);
   * } else {
   *   console.log('Could not detect country');
   * }
   * ```
   */
  async detectCountry(): Promise<DetectCountryResponse> {
    return this.requestGet<DetectCountryResponse>('/v1/signpost/detect-country');
  }

  // ===========================================================================
  // Deprecated Resources Methods (use signpost* methods instead)
  // ===========================================================================

  /**
   * Get crisis resources for a country.
   *
   * @deprecated Use `signpost()` instead. This method calls the deprecated `/v1/resources` endpoint.
   *
   * @param options - Resources options
   * @param options.country - ISO country code (e.g., "US", "GB")
   * @param options.config - Optional filtering configuration
   *
   * @returns ResourcesResponse with crisis resources for the country
   */
  async resources(options: ResourcesOptions): Promise<ResourcesResponse> {
    const { country, config } = options;

    const params = new URLSearchParams();
    params.set('country', country.toUpperCase());

    if (config) {
      if (config.scopes?.length) {
        params.set('scopes', config.scopes.join(','));
      }
      if (config.populations?.length) {
        params.set('populations', config.populations.join(','));
      }
      if (config.limit !== undefined) {
        params.set('limit', config.limit.toString());
      }
      if (config.urgent) {
        params.set('urgent', 'true');
      }
    }

    return this.requestGet<ResourcesResponse>(`/v1/resources?${params.toString()}`);
  }

  /**
   * Get AI-ranked crisis resources based on a semantic query.
   *
   * @deprecated Use `signpostSmart()` instead. This method calls the deprecated `/v1/resources/smart` endpoint.
   *
   * @param options - Smart resources options
   *
   * @returns ResourcesSmartResponse with resources ranked by relevance
   */
  async resourcesSmart(options: ResourcesSmartOptions): Promise<ResourcesSmartResponse> {
    const { country, query, config } = options;

    const params = new URLSearchParams();
    params.set('country', country.toUpperCase());
    params.set('query', query);

    if (config) {
      if (config.scopes?.length) {
        params.set('scopes', config.scopes.join(','));
      }
      if (config.populations?.length) {
        params.set('populations', config.populations.join(','));
      }
      if (config.limit !== undefined) {
        params.set('limit', config.limit.toString());
      }
    }

    const endpoint = this.demo ? '/v1/try/resources/smart' : '/v1/resources/smart';
    return this.requestGet<ResourcesSmartResponse>(`${endpoint}?${params.toString()}`);
  }

  /**
   * Get a single crisis resource by its database ID.
   *
   * @deprecated Use `signpostById()` instead. This method calls the deprecated `/v1/resources/:id` endpoint.
   *
   * @param resourceId - UUID of the resource
   *
   * @returns ResourceByIdResponse with the crisis resource
   */
  async resourceById(resourceId: string): Promise<ResourceByIdResponse> {
    return this.requestGet<ResourceByIdResponse>(`/v1/resources/${resourceId}`);
  }

  /**
   * List all countries with available crisis resources.
   *
   * @deprecated Use `signpostCountries()` instead. This method calls the deprecated `/v1/resources/countries` endpoint.
   *
   * @returns ResourcesCountriesResponse with list of supported country codes
   */
  async resourcesCountries(): Promise<ResourcesCountriesResponse> {
    return this.requestGet<ResourcesCountriesResponse>('/v1/resources/countries');
  }

  /**
   * Make a GET HTTP request to the API.
   */
  private async requestGet<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    const headers: Record<string, string> = {
      'User-Agent': 'nope-node/0.1.0',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
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

    if (response.status === 403) {
      // Check if this is a feature access error
      try {
        const errorData = JSON.parse(responseText) as { feature?: string; required_access?: string };
        if (errorData.feature) {
          throw new NopeFeatureError(
            errorMessage,
            errorData.feature,
            errorData.required_access,
            responseText
          );
        }
      } catch (e) {
        if (e instanceof NopeFeatureError) throw e;
        // Not a feature error, fall through to generic 403
      }
      throw new NopeError(errorMessage, 403, responseText);
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
