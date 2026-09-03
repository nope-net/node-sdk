/**
 * NOPE SDK Client
 *
 * Main client for interacting with the NOPE API.
 */

import { warnOnce } from './deprecation.js';
import { Transport, type ResponseMeta } from './http.js';
import type {
  DetectCountryResponse,
  EvaluateOptions,
  EvaluateResponse,
  Message,
  NopeClientOptions,
  OcularOptions,
  OcularResponse,
  OversightAnalyzeOptions,
  OversightAnalyzeResponseFor,
  OversightIngestOptions,
  OversightIngestResponse,
  ResourceByIdResponse,
  ResourcesCountriesResponse,
  ResourcesOptions,
  ResourcesResponse,
  ResourcesSmartOptions,
  ResourcesSmartResponse,
  ScreenOptions,
  ScreenResponse,
  SignpostByIdResponse,
  SignpostCountriesResponse,
  SignpostOptions,
  SignpostResponse,
  SignpostSearchOptions,
  SignpostSearchResponse,
  SignpostSmartOptions,
  SignpostSmartResponse,
} from './types.js';

const DEFAULT_BASE_URL = 'https://api.nope.net';
const DEFAULT_TIMEOUT = 30000; // milliseconds
const DEFAULT_MAX_RETRIES = 2;
/** Server-side cap on /v1/evaluate and /v0/screen (evaluate.ts:111-138). */
const MAX_EVALUATE_MESSAGES = 100;
/** Server-side cap on /v1/oversight/ingest (ingest.ts:123). */
const MAX_INGEST_CONVERSATIONS = 300;
const OVERSIGHT_SEVERITIES: ReadonlySet<string> = new Set(['low', 'medium', 'high', 'critical']);

/**
 * Validate the messages-or-text input shared by evaluate(), screen() and
 * ocular() and return the payload fragment to send.
 */
function buildTextInput(
  messages: Message[] | undefined,
  text: string | undefined,
  maxMessages?: number
): Record<string, unknown> {
  if (messages === undefined && text === undefined) {
    throw new Error("Either 'messages' or 'text' must be provided");
  }
  if (messages !== undefined && text !== undefined) {
    throw new Error("Only one of 'messages' or 'text' can be provided, not both");
  }
  if (messages !== undefined) {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error("'messages' cannot be empty");
    }
    if (maxMessages !== undefined && messages.length > maxMessages) {
      throw new Error(`'messages' may contain at most ${maxMessages} messages (got ${messages.length})`);
    }
    messages.forEach((m, i) => {
      if (!m || (m.role !== 'user' && m.role !== 'assistant')) {
        throw new Error(`messages[${i}]: role must be "user" or "assistant"`);
      }
      if (typeof m.content !== 'string') {
        throw new Error(`messages[${i}]: content must be a string`);
      }
    });
    return { messages };
  }
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new Error("'text' cannot be empty");
  }
  return { text };
}

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
 *   config: { country: 'US' }
 * });
 * console.log(result.speaker_severity);
 * ```
 */
/**
 * Client for the NOPE API.
 *
 * `Demo` mirrors the `demo` constructor option so that methods whose demo
 * response differs (`oversight.analyze`) return the matching type.
 */
export class NopeClient<Demo extends boolean = false> {
  private readonly transport: Transport;
  private readonly demo: boolean;

  /**
   * Initialize the NOPE client.
   *
   * @param options - Client configuration options
   * @param options.apiKey - Your NOPE API key (`nope_live_...`). Omit for demo mode.
   * @param options.baseUrl - Override the API base URL. Defaults to https://api.nope.net
   * @param options.timeout - Request timeout in milliseconds. Defaults to 30000
   * @param options.demo - Route to the unauthenticated /v1/try/* endpoints
   * @param options.maxRetries - Retries on 429/503 only. Defaults to 2
   * @param options.fetch - Fetch implementation (defaults to the global fetch)
   * @param options.sleep - Sleep between retries (defaults to setTimeout)
   */
  constructor(options: NopeClientOptions & { demo?: Demo } = {}) {
    this.demo = options.demo ?? false;
    this.transport = new Transport({
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      apiKey: options.apiKey,
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
      fetch: options.fetch,
      sleep: options.sleep,
    });
  }

  /**
   * Evaluate a conversation for safety risks ($0.003 per call).
   *
   * Either `messages` or `text` must be provided, and only one of them.
   * Client-side checks: 1 to 100 messages, roles `user` or `assistant`,
   * non-empty text.
   *
   * Demo mode routes to `/v1/try/evaluate`: no key, per-IP rate limit, the
   * last 10 messages only, `include_resources: false` ignored, and
   * `config.country` also sent as `user_country` (the try route reads that
   * key until API fix A-1 deploys).
   *
   * @param options.messages - Conversation messages
   * @param options.text - Plain text input (free-form transcripts)
   * @param options.config - `country`, `include_resources`, `conversation_id`, `end_user_id`
   *
   * @returns risks, speaker severity and imminence, rationale, matched resources
   *
   * @throws {NopeAuthError} Invalid or missing API key
   * @throws {NopeValidationError} Invalid request payload (400) or body over 512 KB (413)
   * @throws {NopeInsufficientBalanceError} Balance cannot cover the call (402)
   * @throws {NopeRateLimitError} Rate limit exceeded after retries
   * @throws {NopeServiceUnavailableError} Provider outage after retries (503)
   * @throws {NopeServerError} Other server error
   * @throws {NopeConnectionError} Connection failed or timed out
   *
   * @example
   * ```typescript
   * const result = await client.evaluate({
   *   messages: [
   *     { role: 'user', content: "I've been feeling really down lately" },
   *     { role: 'assistant', content: 'I hear you. Can you tell me more?' },
   *     { role: 'user', content: "I just don't see the point anymore" }
   *   ],
   *   config: { country: 'US' }
   * });
   *
   * if (result.show_resources && result.resources) {
   *   console.log(`${result.resources.primary.name}: ${result.resources.primary.phone}`);
   * }
   * ```
   */
  async evaluate(options: EvaluateOptions): Promise<EvaluateResponse> {
    const { messages, text, config } = options;
    const payload: Record<string, unknown> = buildTextInput(messages, text, MAX_EVALUATE_MESSAGES);

    const wireConfig: Record<string, unknown> = { ...(config ?? {}) };
    if (this.demo && config?.country) {
      // /v1/try/evaluate reads config.user_country (API fix A-1 pending).
      wireConfig.user_country = config.country;
    }
    payload.config = wireConfig;

    const endpoint = this.demo ? '/v1/try/evaluate' : '/v1/evaluate';
    return this.request<EvaluateResponse>('POST', endpoint, payload);
  }

  /**
   * Behavioral risk assessment via Ocular.
   *
   * Returns a continuous `salience` score in [0, 1] plus structural axes —
   * 8 user-risk axes under `signals.user`, 4 AI-behavior axes under
   * `signals.ai`, an `imminence` axis, and `fiction` / `authenticity`
   * context modulators. Individual behavioral code identities are not
   * exposed.
   *
   * Customer code keys decisions off `salience`: pick the cutoff that
   * fits your action. Reference thresholds (T_WATCH=0.30, T_DANGER=0.60)
   * match the band view in dashboard.nope.net/ocular.
   *
   * Either `messages` or `text` must be provided, but not both.
   *
   * Currently free (beta). Rate-limited via the standard /v1/* limiter.
   *
   * @example
   * ```typescript
   * const result = await client.ocular({
   *   messages: [{ role: 'user', content: 'I feel hopeless' }],
   * });
   * console.log(result.salience, result.subject);
   * // 0.42 "self"
   * const sui = result.signals.user.suicide;
   * if (sui && sui.score > 0.5) {
   *   // escalate ...
   * }
   * ```
   */
  async ocular(options: OcularOptions): Promise<OcularResponse> {
    const { messages, text, thoroughness } = options;

    if (messages === undefined && text === undefined) {
      throw new Error("Either 'messages' or 'text' must be provided");
    }
    if (messages !== undefined && text !== undefined) {
      throw new Error("Only one of 'messages' or 'text' can be provided, not both");
    }

    const payload: Record<string, unknown> = {};
    if (messages !== undefined) payload.messages = messages;
    if (text !== undefined) payload.text = text;
    if (thoroughness !== undefined) payload.thoroughness = thoroughness;

    return this.request<OcularResponse>('POST', '/v1/ocular', payload);
  }

  /**
   * Lightweight crisis screening (legacy).
   *
   * @deprecated Use `evaluate()` instead. The screen endpoint has been consolidated
   * into evaluate ($0.003/call).
   * This method calls the legacy `/v0/screen` endpoint ($0.001/call).
   *
   * Fast, cheap endpoint for detecting suicidal ideation and self-harm.
   * Returns independent detection flags, tuned conservatively (biased toward detection).
   *
   * Either `messages` or `text` must be provided, but not both.
   *
   * @param options - Screen options
   * @param options.messages - List of conversation messages
   * @param options.text - Plain text input (for free-form transcripts)
   * @param options.config - `country`, `debug`, `include_recommended_reply`
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
    warnOnce(
      'screen',
      'screen() is deprecated. Use evaluate() instead ($0.003/call). screen() calls the legacy /v0/screen endpoint.'
    );

    if (this.demo) {
      throw new Error('screen() is not available in demo mode. Use evaluate(), which is served by /v1/try/evaluate.');
    }

    const { messages, text, config } = options;
    const payload: Record<string, unknown> = buildTextInput(messages, text, MAX_EVALUATE_MESSAGES);
    if (config !== undefined) payload.config = config;

    return this.request<ScreenResponse>('POST', '/v0/screen', payload);
  }

  /**
   * Oversight: AI behavior analysis. Detects harmful assistant behaviours
   * (dependency reinforcement, crisis mishandling, manipulation and 88
   * others; see {@link OversightBehaviorCode}) that need conversational
   * context.
   *
   * Requires an account with the Oversight feature enabled
   * (NopeFeatureError otherwise). analyze costs 100 mills ($0.10) per call,
   * ingest 100 mills per conversation.
   */
  readonly oversight = {
    /**
     * Analyze one conversation for harmful AI behaviours. Synchronous;
     * nothing is stored (use `ingest` for dashboard storage).
     *
     * Turn numbers in the result count assistant turns from 1. In fast mode
     * (`config.mode: 'fast'`) `trajectory` is always `stable`,
     * `turn_analysis` and `human_indicators` are empty, and `summary` and
     * `pattern_assessment` are absent.
     *
     * Demo mode routes to `/v1/try/oversight/analyze` and returns
     * {@link OversightDemoAnalyzeResponse}. The demo route ignores
     * `config.strategy` and `config.model`, keeps only `role` and `content`
     * of each message, and accepts at most 20 messages of 10,000 characters.
     *
     * @param options.conversation - The conversation to analyze
     * @param options.bot_context - Description of the bot or persona (accepted by the API; server-side propagation is being fixed)
     * @param options.config - `strategy`, `mode`, `include_raw_xml`, `model`
     * @param options.behaviors - Post-analysis filter: `enabled` xor `disabled`, `min_severity`, `categories`
     *
     * @throws {NopeFeatureError} Oversight not enabled for this account (403)
     * @throws {NopeInsufficientBalanceError} Balance cannot cover the call (402)
     * @throws {NopeValidationError} Invalid request (400)
     *
     * @example
     * ```typescript
     * const { result } = await client.oversight.analyze({
     *   conversation: {
     *     conversation_id: 'conv_123',
     *     messages: [
     *       { role: 'user', content: 'Nobody at work listens to me' },
     *       { role: 'assistant', content: "I'm always here. I understand you better than they ever will." }
     *     ],
     *     metadata: { platform: 'companion-app' }
     *   },
     *   config: { mode: 'fast' },
     *   behaviors: { min_severity: 'medium' }
     * });
     * for (const behavior of result.detected_behaviors) {
     *   console.log(`${behavior.code}: ${behavior.severity} - ${behavior.recommendation}`);
     * }
     * ```
     */
    analyze: async (options: OversightAnalyzeOptions): Promise<OversightAnalyzeResponseFor<Demo>> => {
      const { conversation, bot_context, config, behaviors } = options;

      if (!conversation) {
        throw new Error('"conversation" is required');
      }
      if (!Array.isArray(conversation.messages)) {
        throw new Error('"conversation.messages" must be an array');
      }
      if (conversation.messages.length === 0) {
        throw new Error('"conversation.messages" cannot be empty');
      }
      if (behaviors) {
        if (behaviors.enabled?.length && behaviors.disabled?.length) {
          throw new Error('"behaviors.enabled" and "behaviors.disabled" are mutually exclusive');
        }
        if (behaviors.min_severity !== undefined && !OVERSIGHT_SEVERITIES.has(behaviors.min_severity)) {
          throw new Error('"behaviors.min_severity" must be one of: low, medium, high, critical');
        }
      }

      const payload: Record<string, unknown> = {
        conversation: {
          conversation_id: conversation.conversation_id,
          messages: conversation.messages,
          metadata: conversation.metadata,
        },
      };
      if (bot_context !== undefined) payload.bot_context = bot_context;
      if (config !== undefined) payload.config = config;
      if (behaviors !== undefined) payload.behaviors = behaviors;

      const endpoint = this.demo ? '/v1/try/oversight/analyze' : '/v1/oversight/analyze';
      return this.request<OversightAnalyzeResponseFor<Demo>>('POST', endpoint, payload);
    },

    /**
     * Analyze and store up to 300 conversations for the dashboard,
     * cross-session tracking and audit.
     *
     * Synchronous: the call returns once every conversation is analyzed.
     * Billing is 100 mills per conversation, deducted before analysis; a
     * 402 carries `perConversationMills` and `conversations`. Not available
     * in demo mode.
     *
     * @param options.conversations - 1 to 300 conversations, each with a `conversation_id`
     * @param options.webhook_url - URL to notify on completion (`oversight.ingestion.complete`)
     * @param options.config - `model`
     *
     * @throws {NopeFeatureError} Oversight not enabled for this account (403)
     * @throws {NopeInsufficientBalanceError} Balance cannot cover the batch (402)
     * @throws {NopeValidationError} Invalid request (400)
     *
     * @example
     * ```typescript
     * const result = await client.oversight.ingest({
     *   conversations: [
     *     { conversation_id: 'conv_001', messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }] },
     *     { conversation_id: 'conv_002', messages: [{ role: 'user', content: 'hey' }, { role: 'assistant', content: 'hi there' }] }
     *   ],
     *   webhook_url: 'https://api.example.com/webhooks/nope'
     * });
     * console.log(`${result.conversations_processed}/${result.conversations_received} processed`);
     * ```
     */
    ingest: async (options: OversightIngestOptions): Promise<OversightIngestResponse> => {
      if (this.demo) {
        throw new Error('oversight.ingest() is not available in demo mode. Use an API key.');
      }

      const { conversations, webhook_url, config } = options;

      if (!Array.isArray(conversations)) {
        throw new Error('"conversations" must be an array');
      }
      if (conversations.length === 0) {
        throw new Error('"conversations" array cannot be empty');
      }
      if (conversations.length > MAX_INGEST_CONVERSATIONS) {
        throw new Error(
          `Too many conversations: ${conversations.length}. Maximum allowed: ${MAX_INGEST_CONVERSATIONS}`
        );
      }
      conversations.forEach((conv, i) => {
        if (!conv.conversation_id) {
          throw new Error(`Conversation at index ${i} must have a "conversation_id"`);
        }
        if (!Array.isArray(conv.messages) || conv.messages.length === 0) {
          throw new Error(`Conversation "${conv.conversation_id}" must have non-empty "messages"`);
        }
      });

      const payload: Record<string, unknown> = { conversations };
      if (webhook_url !== undefined) payload.webhook_url = webhook_url;
      if (config !== undefined) payload.config = config;

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
   * Semantic search across all crisis resources using vector embeddings.
   *
   * Unlike `signpostSmart()` (which uses LLM ranking and is country-scoped),
   * this uses pre-computed embeddings for fast semantic search across the
   * entire resource database. Free; requires an API key.
   *
   * @param options - Search options
   * @param options.query - Natural language query (max 500 chars)
   * @param options.country - Optional ISO country code to filter results
   * @param options.limit - Max results (default 10, max 50)
   * @param options.threshold - Similarity threshold in [0, 1] (default 0.3)
   *
   * @returns SignpostSearchResponse with results ranked by similarity
   *
   * @throws {NopeAuthError} Invalid or missing API key
   * @throws {NopeValidationError} Invalid request payload
   * @throws {NopeRateLimitError} Rate limit exceeded
   * @throws {NopeServerError} Server error
   * @throws {NopeConnectionError} Connection failed
   *
   * @example
   * ```typescript
   * const result = await client.signpostSearch({
   *   query: 'lgbtq support for black community',
   *   country: 'US',
   * });
   * for (const r of result.results) {
   *   console.log(`${r.name} (similarity: ${r.similarity})`);
   * }
   * ```
   */
  async signpostSearch(options: SignpostSearchOptions): Promise<SignpostSearchResponse> {
    const { query, country, limit, threshold } = options;

    if (!query) {
      throw new Error('"query" is required');
    }

    const params = new URLSearchParams();
    params.set('query', query);

    if (country) {
      params.set('country', country.toUpperCase());
    }
    if (limit !== undefined) {
      params.set('limit', limit.toString());
    }
    if (threshold !== undefined) {
      params.set('threshold', threshold.toString());
    }

    return this.requestGet<SignpostSearchResponse>(`/v1/signpost/search?${params.toString()}`);
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

  /** Rate-limit and balance headers from the most recent response (undefined before the first call). */
  get lastResponseMeta(): ResponseMeta | undefined {
    return this.transport.lastResponseMeta;
  }

  /** GET a path that already carries its query string. */
  private requestGet<T>(path: string): Promise<T> {
    return this.transport.request<T>('GET', path);
  }

  /** Send a JSON body. */
  private request<T>(method: string, path: string, body?: unknown): Promise<T> {
    return this.transport.request<T>(method, path, { body });
  }
}
