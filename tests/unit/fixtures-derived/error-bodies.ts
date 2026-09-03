/**
 * Error bodies derived from API source (not captured live: 402, 429 and 503
 * need a drained account, a burst, or an outage). Each constant names the
 * lines it was transcribed from, relative to the api repo.
 */

export interface DerivedError {
  status: number;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** api/src/middleware/usage.ts:124-153 (balanceMiddleware, first 402 branch; headers :125-128). */
export const INSUFFICIENT_BALANCE_EVALUATE: DerivedError = {
  status: 402,
  headers: {
    'X-Balance-Mills': '0',
    'X-Balance': '$0.00',
    'X-Cost-Mills': '3',
    'X-Cost': '$0.003',
  },
  body: {
    error: 'insufficient_balance',
    message: 'Insufficient balance. This call costs $0.003 but you have $0.00.',
    balance: {
      current_mills: 0,
      required_mills: 3,
      formatted_current: '$0.00',
      formatted_required: '$0.003',
    },
    topup_url: 'https://dashboard.nope.net/billing',
  },
};

/** api/src/routes/v1/oversight/ingest.ts:280-292 (ingest bills in-route; adds per_conversation_mills and conversations). */
export const INSUFFICIENT_BALANCE_INGEST: DerivedError = {
  status: 402,
  headers: {},
  body: {
    error: 'insufficient_balance',
    message:
      'Insufficient balance. Ingesting 2 conversations costs $0.20 ($0.10/conversation) but you have $0.05.',
    balance: {
      current_mills: 50,
      required_mills: 200,
      formatted_current: '$0.05',
      formatted_required: '$0.20',
      per_conversation_mills: 100,
      conversations: 2,
    },
    topup_url: 'https://dashboard.nope.net/billing',
  },
};

/** api/src/middleware/rate-limit.ts:146-182 (429 branch; X-RateLimit-* from api/lib/redis/rate-limiter.ts:216-221). */
export const RATE_LIMITED: DerivedError = {
  status: 429,
  headers: {
    'Retry-After': '7',
    'X-RateLimit-Limit': '100',
    'X-RateLimit-Remaining': '0',
    'X-RateLimit-Reset': '1788396967000',
  },
  body: {
    error: 'rate_limit_exceeded',
    message: 'Rate limit exceeded. Please retry after 7 seconds.',
    retry_after_seconds: 7,
    limit: 100,
    remaining: 0,
    reset: 1788396967000,
  },
};

/** api/src/error-handler.ts:33-41 (DependencyUnavailableError -> 503 + Retry-After; default 5 s from api/lib/utils/dependency-unavailable.ts:19). */
export const DEPENDENCY_UNAVAILABLE: DerivedError = {
  status: 503,
  headers: { 'Retry-After': '5' },
  body: {
    error: 'auth_unavailable',
    message: 'Authentication service temporarily unavailable',
    retry_after_seconds: 5,
  },
};

/** api/src/routes/v1/evaluate.ts:263-269 (ServiceUnavailableError from the evaluator chain). */
export const SERVICE_UNAVAILABLE: DerivedError = {
  status: 503,
  headers: { 'Retry-After': '30' },
  body: {
    error: 'service_unavailable',
    message: 'All classification providers are unavailable',
    retry_after_seconds: 30,
  },
};

/** api/src/middleware/rate-limit.ts:155 (fail-closed endpoint with the limiter down; no Retry-After). */
export const TEMPORARILY_UNAVAILABLE: DerivedError = {
  status: 503,
  headers: {},
  body: { error: 'Temporarily unavailable' },
};

/** api/src/routes/v1/oversight/analyze.ts:209-214 (feature gate). */
export const FEATURE_DENIED: DerivedError = {
  status: 403,
  headers: {},
  body: {
    error: 'Oversight feature is not enabled for this account',
    feature: 'OVERSIGHT',
    required_access: 'admin',
  },
};

/** api/src/routes/v1/webhooks.ts:104-110 (webhook create on a free plan). */
export const PAID_PLAN_REQUIRED: DerivedError = {
  status: 403,
  headers: {},
  body: {
    error: 'paid_plan_required',
    message: 'Webhooks are available on paid plans. Please upgrade to use this feature.',
    upgrade_url: 'https://dashboard.nope.net/billing',
  },
};

/** api/src/routes/v1/try.ts:99-104 (demo evaluate with use_multiple_judges). */
export const DEMO_UPGRADE_REQUIRED: DerivedError = {
  status: 403,
  headers: {},
  body: {
    error: 'Multiple judges feature requires an API key',
    upgrade_url: 'https://dashboard.nope.net',
  },
};

/** api/src/routes/v1/civility.ts:17-28 (retired route). */
export const GONE: DerivedError = {
  status: 410,
  headers: {},
  body: {
    error: 'gone',
    message:
      'The /v1/civility endpoint has been retired and is no longer available. It has no replacement; contact hello@nope.net if you were relying on it.',
    retired: '2026-07-10',
  },
};

/** api/src/error-handler.ts:54 (unhandled error; message echoes err.message). */
export const INTERNAL_ERROR: DerivedError = {
  status: 500,
  headers: {},
  body: { error: 'Internal server error', message: 'boom' },
};

/** api/src/routes/v1/webhooks.ts:362-364 (test ping failed: 502 with a WebhookDeliveryResult, no error key). */
export const WEBHOOK_TEST_FAILED: DerivedError = {
  status: 502,
  headers: {},
  body: {
    success: false,
    http_status: 500,
    error_message: 'HTTP 500',
    duration_ms: 812,
  },
};
