/**
 * NOPE SDK Client
 *
 * Main client for interacting with the NOPE API.
 */

import { warnOnce } from './deprecation.js';
import { Transport, type ResponseMeta } from './http.js';
import type {
  BillingBalanceResponse,
  BillingPricingResponse,
  BillingTopupOptions,
  BillingTopupResponse,
  BillingUsageHistoryOptions,
  BillingUsageHistoryResponse,
  BillingUsageOptions,
  BillingUsageResponse,
  DetectCountryOptions,
  DetectCountryResponse,
  DetectCountryResult,
  EvaluateOptions,
  EvaluateResponse,
  Message,
  NopeClientOptions,
  OcularOptions,
  OcularResponseFor,
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
  SignpostConfig,
  SignpostCountriesResponse,
  SignpostOptions,
  SignpostResponse,
  SignpostSearchOptions,
  SignpostSearchResponse,
  SignpostSmartConfig,
  SignpostSmartOptions,
  SignpostSmartResponse,
} from './types.js';
import type {
  WebhookCreateOptions,
  WebhookDeleteResponse,
  WebhookDeliveryResult,
  WebhookEventsOptions,
  WebhookEventsResponse,
  WebhookListResponse,
  WebhookResponse,
  WebhookSecretResponse,
  WebhookUpdateOptions,
} from './webhook.js';

const DEFAULT_BASE_URL = 'https://api.nope.net';
const DEFAULT_TIMEOUT = 30000; // milliseconds
const DEFAULT_MAX_RETRIES = 2;
/** Server-side cap on /v1/evaluate and /v0/screen (evaluate.ts:111-138). */
const MAX_EVALUATE_MESSAGES = 100;
/** Server-side cap on /v1/oversight/ingest (ingest.ts:123). */
const MAX_INGEST_CONVERSATIONS = 300;
const OVERSIGHT_SEVERITIES: ReadonlySet<string> = new Set(['low', 'medium', 'high', 'critical']);
const OCULAR_THOROUGHNESS: ReadonlySet<string> = new Set(['fast', 'auto', 'thorough']);
/** Server-side bounds on /v1/ocular (ocular.ts:63-67). */
const MAX_TRAJECTORY_STRIDE = 64;
const MAX_IDENTITY_LENGTH = 256;

type SignpostQuery = Record<string, string | number | boolean | undefined>;

/** Merge top-level filters over `config` (top level wins) and serialise them. */
function mergeSignpostFilters(config: SignpostConfig | undefined, top: SignpostConfig): SignpostQuery {
  const merged: SignpostConfig = { ...(config ?? {}) };
  for (const key of ['scopes', 'populations', 'subdivisions', 'limit', 'urgent'] as const) {
    if (top[key] !== undefined) (merged as Record<string, unknown>)[key] = top[key];
  }
  return {
    scopes: merged.scopes?.length ? merged.scopes.join(',') : undefined,
    populations: merged.populations?.length ? merged.populations.join(',') : undefined,
    subdivisions: merged.subdivisions?.length ? merged.subdivisions.map((s) => s.toUpperCase()).join(',') : undefined,
    limit: merged.limit,
    urgent: merged.urgent ? 'true' : undefined,
  };
}

function smartFilters(config: SignpostSmartConfig | undefined): SignpostQuery {
  return {
    scopes: config?.scopes?.length ? config.scopes.join(',') : undefined,
    populations: config?.populations?.length ? config.populations.join(',') : undefined,
    limit: config?.limit,
  };
}

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
   * Behavioral risk assessment via Ocular ($0.0001 per call).
   *
   * Returns a continuous `salience` score in [0, 1] plus structural axes:
   * 8 user-risk axes under `signals.user`, 4 AI-behavior axes under
   * `signals.ai`, an `imminence` axis, and the `fiction` / `authenticity`
   * context modulators. Individual head identities are not exposed.
   *
   * Pick the `salience` cutoff that fits your action; the reference
   * thresholds are T_WATCH = 0.30 and T_DANGER = 0.60. Set `per_turn: true`
   * to receive `trajectory` (per-turn salience and axis scores) and
   * `trajectory_shape`; without it neither field is present.
   * `meta.windowed` and `meta.windows` are always present.
   *
   * Demo mode routes to `/v1/try/ocular` (at most 12 messages or 4,000
   * characters) and returns {@link OcularDemoResponse}, which adds `heads`
   * and `detail` keyed by public family names.
   *
   * @param options.messages - Conversation messages (roles user|assistant)
   * @param options.text - Plain text input
   * @param options.thoroughness - 'fast' | 'auto' | 'thorough'
   * @param options.per_turn - Score every turn and return the trajectory
   * @param options.trajectory_stride - With per_turn: stride 1..64
   * @param options.user_id - Opaque id for dashboard analytics (never forwarded to the model)
   * @param options.session_id - Opaque id for dashboard analytics
   * @param options.agent_id - Opaque id for dashboard analytics
   *
   * @example
   * ```typescript
   * const result = await client.ocular({
   *   messages: [{ role: 'user', content: 'I feel hopeless' }],
   *   per_turn: true,
   * });
   * console.log(result.salience, result.subject);
   * const sui = result.signals.user.suicide;
   * if (sui && sui.score > 0.5) {
   *   // escalate
   * }
   * for (const turn of result.trajectory ?? []) {
   *   console.log(turn.turn, turn.salience, turn.signals_by_axis?.suicide);
   * }
   * ```
   */
  async ocular(options: OcularOptions): Promise<OcularResponseFor<Demo>> {
    const { messages, text, thoroughness, per_turn, trajectory_stride, user_id, session_id, agent_id } = options;
    const payload: Record<string, unknown> = buildTextInput(messages, text);

    if (thoroughness !== undefined) {
      if (!OCULAR_THOROUGHNESS.has(thoroughness)) {
        throw new Error('"thoroughness" must be "fast", "auto", or "thorough"');
      }
      payload.thoroughness = thoroughness;
    }
    if (per_turn !== undefined) {
      if (typeof per_turn !== 'boolean') throw new Error('"per_turn" must be a boolean');
      payload.per_turn = per_turn;
    }
    if (trajectory_stride !== undefined) {
      if (
        !Number.isInteger(trajectory_stride) ||
        trajectory_stride < 1 ||
        trajectory_stride > MAX_TRAJECTORY_STRIDE
      ) {
        throw new Error(`"trajectory_stride" must be an integer in 1..${MAX_TRAJECTORY_STRIDE}`);
      }
      payload.trajectory_stride = trajectory_stride;
    }
    const identity: Array<[string, string | undefined]> = [
      ['user_id', user_id],
      ['session_id', session_id],
      ['agent_id', agent_id],
    ];
    for (const [key, value] of identity) {
      if (value === undefined) continue;
      if (typeof value !== 'string' || value.length === 0 || value.length > MAX_IDENTITY_LENGTH) {
        throw new Error(`"${key}" must be 1..${MAX_IDENTITY_LENGTH} characters`);
      }
      payload[key] = value;
    }

    const endpoint = this.demo ? '/v1/try/ocular' : '/v1/ocular';
    return this.request<OcularResponseFor<Demo>>('POST', endpoint, payload);
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
  // Webhook management (/v1/webhooks; API key required, paid plan to create)
  // ===========================================================================

  /**
   * Manage webhook endpoints. Deliveries are verified with {@link Webhook}.
   * Not available in demo mode. The family is rate limited at 30/min.
   */
  readonly webhooks = {
    /**
     * Register an endpoint. The response carries the signing `secret` once;
     * store it. Requires a paid plan (NopeFeatureError with `upgradeUrl`
     * otherwise). URLs must be HTTPS (http only for localhost) and public.
     */
    create: async (options: WebhookCreateOptions): Promise<WebhookResponse> => {
      this.requireNotDemo('webhooks.create()');
      return this.transport.request<WebhookResponse>('POST', '/v1/webhooks', { body: options });
    },

    /** List the account's webhooks (without secrets). */
    list: async (): Promise<WebhookListResponse> => {
      this.requireNotDemo('webhooks.list()');
      return this.transport.request<WebhookListResponse>('GET', '/v1/webhooks');
    },

    /** One webhook by id (NopeNotFoundError when unknown). */
    get: async (id: string): Promise<WebhookResponse> => {
      this.requireNotDemo('webhooks.get()');
      return this.transport.request<WebhookResponse>('GET', `/v1/webhooks/${encodeURIComponent(id)}`);
    },

    /** Update url, min_risk_level, enabled or include_conversation. */
    update: async (id: string, patch: WebhookUpdateOptions): Promise<WebhookResponse> => {
      this.requireNotDemo('webhooks.update()');
      return this.transport.request<WebhookResponse>('PUT', `/v1/webhooks/${encodeURIComponent(id)}`, { body: patch });
    },

    /** Delete a webhook. */
    delete: async (id: string): Promise<WebhookDeleteResponse> => {
      this.requireNotDemo('webhooks.delete()');
      return this.transport.request<WebhookDeleteResponse>('DELETE', `/v1/webhooks/${encodeURIComponent(id)}`);
    },

    /** Rotate the signing secret. The old secret stops working immediately. */
    regenerateSecret: async (id: string): Promise<WebhookSecretResponse> => {
      this.requireNotDemo('webhooks.regenerateSecret()');
      return this.transport.request<WebhookSecretResponse>(
        'POST',
        `/v1/webhooks/${encodeURIComponent(id)}/regenerate-secret`
      );
    },

    /**
     * Send a `test.ping` to the endpoint and return the delivery result.
     * A failed delivery comes back as `{success: false, ...}` (the API
     * answers 502 with the same body), so callers branch on `success`
     * rather than catching.
     */
    test: async (id: string): Promise<WebhookDeliveryResult> => {
      this.requireNotDemo('webhooks.test()');
      const result = await this.transport.requestRaw<WebhookDeliveryResult>(
        'POST',
        `/v1/webhooks/${encodeURIComponent(id)}/test`,
        { acceptStatuses: [502] }
      );
      return result.body;
    },

    /**
     * Recent deliveries for one webhook, or for the whole account when `id`
     * is omitted. `limit` defaults to 50 (max 100).
     */
    events: async (id?: string, options: WebhookEventsOptions = {}): Promise<WebhookEventsResponse> => {
      this.requireNotDemo('webhooks.events()');
      const path = id ? `/v1/webhooks/${encodeURIComponent(id)}/events` : '/v1/webhooks/events';
      return this.transport.request<WebhookEventsResponse>('GET', path, { query: { limit: options.limit } });
    },
  };

  // ===========================================================================
  // Billing (/v1/billing; API key required except pricing)
  // ===========================================================================

  /**
   * Balance, usage and pricing. Amounts are in mills (1 mill = $0.001).
   * Not available in demo mode; `pricing()` needs no key on a normal client.
   */
  readonly billing = {
    /** Current balance, estimates, top-up history and options. */
    balance: async (): Promise<BillingBalanceResponse> => {
      this.requireNotDemo('billing.balance()');
      return this.transport.request<BillingBalanceResponse>('GET', '/v1/billing/balance');
    },

    /** Spend by endpoint for a period (default: the current month). */
    usage: async (options: BillingUsageOptions = {}): Promise<BillingUsageResponse> => {
      this.requireNotDemo('billing.usage()');
      return this.transport.request<BillingUsageResponse>('GET', '/v1/billing/usage', {
        query: { start_date: options.start_date, end_date: options.end_date },
      });
    },

    /** Individual billed calls, paginated. */
    usageHistory: async (options: BillingUsageHistoryOptions = {}): Promise<BillingUsageHistoryResponse> => {
      this.requireNotDemo('billing.usageHistory()');
      return this.transport.request<BillingUsageHistoryResponse>('GET', '/v1/billing/usage/history', {
        query: {
          limit: options.limit,
          offset: options.offset,
          endpoint: options.endpoint,
          start_date: options.start_date,
          end_date: options.end_date,
        },
      });
    },

    /** Public price list (no key needed). */
    pricing: async (): Promise<BillingPricingResponse> => {
      this.requireNotDemo('billing.pricing()');
      return this.transport.request<BillingPricingResponse>('GET', '/v1/billing/pricing');
    },

    /**
     * Create a Stripe Checkout session for a top-up and return its URL.
     * `amount_mills` must be one of the `topup_options` amounts
     * (NopeValidationError with `details.valid_options` otherwise).
     */
    topup: async (options: BillingTopupOptions): Promise<BillingTopupResponse> => {
      this.requireNotDemo('billing.topup()');
      return this.transport.request<BillingTopupResponse>('POST', '/v1/billing/topup', { body: options });
    },
  };

  // ===========================================================================
  // Signpost (crisis resources)
  // ===========================================================================

  /**
   * Crisis resources for a country (free, no model call; API key required).
   *
   * Filters may be passed at the top level or under `config`; a top-level
   * value wins. Arrays are sent comma-joined. Scope and population values
   * come from the generated {@link ServiceScope} and {@link Population}
   * vocabularies (the API returns 400 for unknown values). Not available in
   * demo mode.
   *
   * @param options.country - ISO 3166-1 alpha-2 code (e.g. 'US', 'GB')
   * @param options.scopes - e.g. ['suicide', 'domestic_violence']
   * @param options.populations - e.g. ['youth', 'veterans']
   * @param options.subdivisions - e.g. ['GB-NIR']
   * @param options.limit - Server cap 10
   * @param options.urgent - Only 24/7 urgent resources
   *
   * @example
   * ```typescript
   * const result = await client.signpost({ country: 'GB', scopes: ['suicide'], urgent: true });
   * for (const resource of result.resources) {
   *   console.log(`${resource.name}: ${resource.phone ?? resource.website_url}`);
   * }
   * ```
   */
  async signpost(options: SignpostOptions): Promise<SignpostResponse> {
    this.requireNotDemo('signpost()');
    const { country, config, ...top } = options;
    const filters = mergeSignpostFilters(config, top);
    return this.transport.request<SignpostResponse>('GET', '/v1/signpost', {
      query: { country: country.toUpperCase(), ...filters },
    });
  }

  /**
   * Crisis resources ranked for a described situation ($0.001 per call).
   *
   * A model ranks the country's candidate pool against `query` and returns
   * up to 5 picks, each with a one-line `why`. Demo mode routes to
   * `/v1/try/signpost/smart` (no key, per-IP rate limit).
   *
   * @param options.country - ISO 3166-1 alpha-2 code
   * @param options.query - Natural-language description (max 500 characters)
   * @param options.config - `scopes`, `populations`, `limit`
   *
   * @example
   * ```typescript
   * const result = await client.signpostSmart({
   *   country: 'US',
   *   query: 'teen struggling with an eating disorder'
   * });
   * for (const pick of result.ranked) {
   *   console.log(`${pick.rank}. ${pick.resource.name}: ${pick.why}`);
   * }
   * ```
   */
  async signpostSmart(options: SignpostSmartOptions): Promise<SignpostSmartResponse> {
    const { country, query, config } = options;
    const endpoint = this.demo ? '/v1/try/signpost/smart' : '/v1/signpost/smart';
    return this.transport.request<SignpostSmartResponse>('GET', endpoint, {
      query: { country: country.toUpperCase(), query, ...smartFilters(config) },
    });
  }

  /**
   * Semantic search across the whole resource directory (free; API key
   * required). Uses pre-computed embeddings rather than model ranking and is
   * not country-scoped unless `country` is given. Results are raw directory
   * rows ({@link SignpostSearchResult}) and carry the database `id`. Not
   * available in demo mode.
   *
   * @param options.query - Natural-language query (max 500 characters)
   * @param options.country - Optional ISO 3166-1 alpha-2 filter
   * @param options.limit - Max results (default 10, max 50)
   * @param options.threshold - Similarity threshold in [0, 1] (default 0.3)
   *
   * @example
   * ```typescript
   * const hits = await client.signpostSearch({ query: 'lgbtq youth support', country: 'GB' });
   * for (const hit of hits.results) {
   *   console.log(`${hit.name} (${hit.similarity.toFixed(2)}): ${hit.phone ?? hit.website_url}`);
   * }
   * ```
   */
  async signpostSearch(options: SignpostSearchOptions): Promise<SignpostSearchResponse> {
    this.requireNotDemo('signpostSearch()');
    const { query, country, limit, threshold } = options;
    if (!query) {
      throw new Error('"query" is required');
    }
    return this.transport.request<SignpostSearchResponse>('GET', '/v1/signpost/search', {
      query: { query, country: country?.toUpperCase(), limit, threshold },
    });
  }

  /**
   * One crisis resource by database id (public, no key). Ids come from
   * signpostSearch() results.
   *
   * @throws {NopeValidationError} Malformed id (400)
   * @throws {NopeNotFoundError} Unknown id (404)
   */
  async signpostById(resourceId: string): Promise<SignpostByIdResponse> {
    return this.transport.request<SignpostByIdResponse>('GET', `/v1/signpost/${encodeURIComponent(resourceId)}`);
  }

  /**
   * Country codes with crisis resources (public, no key).
   *
   * @example
   * ```typescript
   * const { countries, count } = await client.signpostCountries();
   * console.log(`${count} countries, starting ${countries[0]}`);
   * ```
   */
  async signpostCountries(): Promise<SignpostCountriesResponse> {
    return this.transport.request<SignpostCountriesResponse>('GET', '/v1/signpost/countries');
  }

  /**
   * Country detection from geo headers (public, no key).
   *
   * Works only behind a proxy that injects a geo header (Cloudflare's
   * `cf-ipcountry`, Vercel's `x-vercel-ip-country`, or `x-country`). Called
   * directly against api.nope.net it returns the miss shape with
   * `detected: false`. Pass `countryHint` to send `x-country` yourself.
   *
   * @example
   * ```typescript
   * const geo = await client.detectCountry();
   * const country = geo.detected ? geo.country_code : 'US';
   * ```
   */
  async detectCountry(options: DetectCountryOptions = {}): Promise<DetectCountryResult> {
    const headers: Record<string, string> = {};
    if (options.countryHint) headers['x-country'] = options.countryHint.toUpperCase();
    const body = await this.transport.request<DetectCountryResponse>('GET', '/v1/signpost/detect-country', { headers });
    return { ...body, detected: body.country_code !== '' };
  }

  // ===========================================================================
  // Deprecated /v1/resources/* twins (sunset 2027-01-01; use signpost*)
  // ===========================================================================

  /**
   * @deprecated Use signpost(). Calls /v1/resources, which the API serves
   * with Deprecation and Sunset headers until 2027-01-01.
   */
  async resources(options: ResourcesOptions): Promise<ResourcesResponse> {
    this.warnResourcesDeprecated('resources()', 'signpost()');
    this.requireNotDemo('resources()');
    const { country, config, ...top } = options;
    const filters = mergeSignpostFilters(config, top);
    return this.transport.request<ResourcesResponse>('GET', '/v1/resources', {
      query: { country: country.toUpperCase(), ...filters },
    });
  }

  /**
   * @deprecated Use signpostSmart(). Calls /v1/resources/smart (sunset 2027-01-01).
   */
  async resourcesSmart(options: ResourcesSmartOptions): Promise<ResourcesSmartResponse> {
    this.warnResourcesDeprecated('resourcesSmart()', 'signpostSmart()');
    const { country, query, config } = options;
    const endpoint = this.demo ? '/v1/try/resources/smart' : '/v1/resources/smart';
    return this.transport.request<ResourcesSmartResponse>('GET', endpoint, {
      query: { country: country.toUpperCase(), query, ...smartFilters(config) },
    });
  }

  /**
   * @deprecated Use signpostById(). Calls /v1/resources/:id (sunset 2027-01-01).
   */
  async resourceById(resourceId: string): Promise<ResourceByIdResponse> {
    this.warnResourcesDeprecated('resourceById()', 'signpostById()');
    return this.transport.request<ResourceByIdResponse>('GET', `/v1/resources/${encodeURIComponent(resourceId)}`);
  }

  /**
   * @deprecated Use signpostCountries(). Calls /v1/resources/countries (sunset 2027-01-01).
   */
  async resourcesCountries(): Promise<ResourcesCountriesResponse> {
    this.warnResourcesDeprecated('resourcesCountries()', 'signpostCountries()');
    return this.transport.request<ResourcesCountriesResponse>('GET', '/v1/resources/countries');
  }

  private warnResourcesDeprecated(method: string, replacement: string): void {
    warnOnce(
      method,
      `${method} is deprecated: the /v1/resources routes reach sunset 2027-01-01; use signpost* (${replacement}) instead.`
    );
  }

  private requireNotDemo(method: string): void {
    if (this.demo) {
      throw new Error(`${method} is not available in demo mode. Use an API key.`);
    }
  }

  /** Rate-limit and balance headers from the most recent response (undefined before the first call). */
  get lastResponseMeta(): ResponseMeta | undefined {
    return this.transport.lastResponseMeta;
  }

  /** Send a JSON body. */
  private request<T>(method: string, path: string, body?: unknown): Promise<T> {
    return this.transport.request<T>(method, path, { body });
  }
}
