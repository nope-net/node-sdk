# NOPE Node SDK

[![npm version](https://badge.fury.io/js/%40nope-net%2Fsdk.svg)](https://www.npmjs.com/package/@nope-net/sdk)
[![Node 18+](https://img.shields.io/badge/node-18+-blue.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

TypeScript client for the [NOPE](https://nope.net) API. NOPE reads
conversations between people and AI systems and returns structured safety
signals: mental-health and safeguarding risk (Evaluate), behavioral risk
scores (Ocular), harmful AI-behaviour analysis (Oversight), and crisis
resources by country (Signpost). The SDK also verifies webhook deliveries,
manages webhook endpoints, and reads billing.

The package ships ESM and CommonJS builds with type declarations. Every
response type is checked against responses captured from the live API
(`tests/fixtures/`), so a field in the types is a field on the wire.

## Requirements

- Node.js 18 or later (the client uses the built-in `fetch`).
- An API key from [dashboard.nope.net](https://dashboard.nope.net) for the
  paid and key-gated routes. Demo mode (below) covers `evaluate`, `ocular`,
  `oversight.analyze` and `signpostSmart` without a key.

## Installation

```bash
npm install @nope-net/sdk
# or
pnpm add @nope-net/sdk
```

## Quick start

```typescript
import { NopeClient } from '@nope-net/sdk';

const client = new NopeClient({ apiKey: process.env.NOPE_API_KEY });

const result = await client.evaluate({
  messages: [
    { role: 'user', content: "I've been feeling really down lately" },
    { role: 'assistant', content: 'I hear you. Can you tell me more?' },
    { role: 'user', content: "I just don't see the point anymore" },
  ],
  config: { country: 'US' },
});

console.log(result.speaker_severity, result.speaker_imminence);
console.log(result.rationale);

if (result.show_resources && result.resources) {
  const { primary } = result.resources;
  console.log(`${primary.name}: ${primary.phone ?? primary.website_url} (${primary.why})`);
}
```

## Client options

| Option | Default | Notes |
|---|---|---|
| `apiKey` | none | `nope_live_...` from the dashboard. Omit for demo mode or key-free routes. |
| `baseUrl` | `https://api.nope.net` | A trailing slash is tolerated. |
| `timeout` | `30000` | Milliseconds per attempt. |
| `demo` | `false` | Route to the unauthenticated `/v1/try/*` endpoints. |
| `maxRetries` | `2` | Retries on 429 and 503 only. |
| `fetch` | global `fetch` | Inject a wrapped fetch for tracing, or a fake in tests. |
| `sleep` | `setTimeout` | Wait between retries; inject in tests. |

### Demo mode

`new NopeClient({ demo: true })` needs no key and routes four methods to the
per-IP rate-limited `/v1/try/*` endpoints:

| Method | Demo route | Differences from the authenticated route |
|---|---|---|
| `evaluate` | `/v1/try/evaluate` | Keeps the last 10 messages, honours `include_resources`, adds `metadata.try_endpoint` and `metadata.model`. The route reads `config.country`; the client also sends the value as `config.user_country`, the older spelling the route accepts when `country` is absent. 10 calls per minute per IP. |
| `oversight.analyze` | `/v1/try/oversight/analyze` | Returns `{ mode, result, try_endpoint }` (`OversightDemoAnalyzeResponse`). Ignores `config.strategy` and `config.model`, keeps only `role` and `content`, accepts at most 20 messages. |
| `ocular` | `/v1/try/ocular` | Returns `OcularDemoResponse`, which adds `heads` and `detail` under public family names. At most 12 messages or 4,000 characters. With `per_turn` it returns `trajectory` but never `trajectory_shape`. |
| `signpostSmart` | `/v1/try/signpost/smart` | Adds `try_endpoint: true`. |

Every other method throws `NopeValidationError` (`... is not available in
demo mode`, `code: 'not_available_in_demo'`, no `statusCode`) before any
request is sent.

## Evaluate

`client.evaluate(options)` costs $0.003 per call. Pass `messages` (1 to 100,
roles `user` or `assistant`) or `text` (a transcript, up to 50,000
characters). `config` takes the four keys the route reads:

| Key | Purpose |
|---|---|
| `country` | ISO 3166-1 alpha-2 for crisis resources (default `US`). |
| `include_resources` | Set `false` to skip resource matching (default `true`). |
| `conversation_id` | Echoed on `evaluate.alert` webhook payloads. |
| `end_user_id` | Echoed on `evaluate.alert` webhook payloads as `user_id`. |

```typescript
import { NopeClient, calculateSpeakerSeverity, type EvaluateResource } from '@nope-net/sdk';

const client = new NopeClient({ apiKey: process.env.NOPE_API_KEY });

const result = await client.evaluate({
  text: 'Patient expressed hopelessness and mentioned not wanting to continue.',
  config: { country: 'GB', conversation_id: 'conv_42', end_user_id: 'user_7' },
});

for (const risk of result.risks) {
  console.log(risk.type, risk.subject, risk.severity, risk.imminence, risk.features ?? []);
}

// speaker_severity is the highest severity among risks with subject 'self'.
console.log(calculateSpeakerSeverity(result.risks) === result.speaker_severity);
console.log(result.request_id, result.timestamp, result.metadata?.input_format);

// resources.primary and resources.secondary[] are EvaluateResource: a CrisisResource plus `why`.
const top: EvaluateResource | undefined = result.resources?.primary;
console.log(top?.name, top?.why);
```

`EvaluateResponse` fields: `risks: Risk[]`, `rationale`, `speaker_severity`,
`speaker_imminence`, `show_resources`, `resources?` (an `EvaluateResources`:
`primary` and up to three `secondary`, each an `EvaluateResource`, which is
a `CrisisResource` plus a one-line `why`), `request_id`, `timestamp`,
`metadata?`.

`Risk` is `{ type, subject, severity, imminence, features? }`. `subject` is
`self` or `other`. Severity runs `none | mild | moderate | high | critical`;
imminence runs `not_applicable | chronic | subacute | urgent | emergency`.
The nine risk types are `suicide`, `self_harm`, `self_neglect`, `violence`,
`abuse`, `sexual_violence`, `neglect`, `exploitation` and `stalking`.

### Legacy screen()

`client.screen()` is deprecated: use `evaluate()` ($0.003 per call). It
still calls the legacy `/v0/screen` endpoint ($0.001 per call), which
carries a sunset of 2027-01-01. The client logs one warning per process
saying so, and refuses the call in demo mode. `ScreenConfig` is
`{ country?, debug?, include_recommended_reply? }`.

## Ocular

`client.ocular(options)` costs $0.0001 per call and returns a continuous
`salience` score in [0, 1] plus eight user-risk axes under `signals.user`
and four AI-behaviour axes under `signals.ai`, each `{ level, score }`. Pick
the `salience` cutoff that fits your action; the reference thresholds are
0.30 (watch) and 0.60 (danger).

```typescript
import { NopeClient } from '@nope-net/sdk';

const client = new NopeClient({ apiKey: process.env.NOPE_API_KEY });

const result = await client.ocular({
  messages: [
    { role: 'user', content: 'I feel hopeless' },
    { role: 'assistant', content: 'I am here with you.' },
    { role: 'user', content: 'Nothing helps any more.' },
  ],
  per_turn: true,
  trajectory_stride: 1, // score every turn; the server default of 3 scores every third turn back from the last
  session_id: 'session_9',
});

console.log(result.salience, result.subject, result.imminence.level);
const suicide = result.signals.user.suicide;
if (suicide && suicide.score > 0.5) {
  console.log('escalate');
}
for (const turn of result.trajectory ?? []) {
  // turn.turn is the 0-based position in messages; AI axes are ai_-prefixed here
  console.log(turn.turn, turn.role, turn.salience, turn.signals_by_axis?.suicide, turn.signals_by_axis?.ai_manipulation);
}
const shape = result.trajectory_shape;
if (shape?.peak_turn !== undefined && result.trajectory) {
  const peak = result.trajectory[shape.peak_turn]; // peak_turn indexes the trajectory array, not messages
  console.log(peak.turn, shape.phases?.[shape.peak_turn], shape.onsets?.suicide);
}
console.log(result.meta.version);
```

`user_id`, `session_id` and `agent_id` (1 to 256 characters) are stored for
dashboard analytics and never forwarded to the model.

### Per-turn trajectory

Set `per_turn: true` to receive `trajectory`, one entry per scored turn,
and `trajectory_shape`. Not every turn is scored: `trajectory_stride`
defaults to 3 on the server, which scores the last turn and then every
third turn back from it, so a 5-message conversation yields turns 4 and 1.
Pass `trajectory_stride: 1` to score every turn. An entry's `turn` is the
0-based position of that turn in `messages` (for `text` input, of the
parsed speaker turn) and its `role` is `user` or `assistant`.
`signals_by_axis` keys the user axes by bare name (`suicide`), the AI axes
with an `ai_` prefix (`ai_manipulation`, where the top level has
`signals.ai.manipulation`), and adds two context scalars, `genuine` and
`fiction`.

`trajectory_shape` summarises the crisis (suicide) axis over the scored
turns. `onsets` maps an axis to the `turn` value at which it first crossed
its onset threshold. `phases`, `slopes` and `peak_turn` index the
`trajectory` array instead: `phases[i]` and `slopes[i]` describe
`trajectory[i]`, and `peak_turn` is the array position of the entry with
the highest crisis score, so `trajectory[shape.peak_turn].turn` is the
message index. The authenticated route returns `trajectory_shape` whenever
at least one turn was scored; the demo route (`/v1/try/ocular`) returns
`trajectory` but never `trajectory_shape`.

## Oversight

Oversight analyzes an AI assistant's side of a conversation using 91 behavior
codes: 87 harmful and 4 appropriate, across 14 categories (dependency reinforcement, crisis mishandling,
manipulation, boundary violations and so on). It requires an account with
the feature enabled; `analyze` costs 100 mills ($0.10) per call and
`ingest` 100 mills per conversation.

```typescript
import { NopeClient } from '@nope-net/sdk';

const client = new NopeClient({ apiKey: process.env.NOPE_API_KEY });

const { result, strategy } = await client.oversight.analyze({
  conversation: {
    conversation_id: 'conv_123',
    messages: [
      { role: 'user', content: 'Nobody at work listens to me.' },
      { role: 'assistant', content: "I'm always here and I understand you better than they ever will." },
    ],
    metadata: { platform: 'companion-app', user_is_minor: false },
  },
  bot_context: 'general-purpose assistant for a productivity app',
  config: { mode: 'fast' },
  behaviors: { min_severity: 'medium', categories: ['boundary_violations', 'relationship_harm'] },
});

console.log(strategy, result.mode_used, result.overall_concern, result.trajectory);
for (const behavior of result.detected_behaviors) {
  console.log(`${behavior.code} (${behavior.severity} x${behavior.turn_count}): ${behavior.recommendation}`);
}
```

- `config.mode`: `full` (default) or `fast`. Fast mode uses a quicker model;
  `trajectory` is always `stable`, `turn_analysis` and `human_indicators`
  are empty, and `summary` and `pattern_assessment` are absent.
- `config.strategy`: `single` or `sliding`; auto-selected by length when
  omitted. Sliding results carry `windows` (each with `message_range` and
  `conversation_turn_range`), `concern_progression`, `peak_concern`,
  `final_concern` and `inflection_points`.
- `behaviors`: a post-analysis filter. `enabled` and `disabled` are
  mutually exclusive; codes and categories come from the exported
  `OversightBehaviorCode` and `OversightBehaviorCategory` unions
  (`OVERSIGHT_BEHAVIOR_CODES`, `OVERSIGHT_BEHAVIOR_CATEGORIES`).
- `bot_context` is passed into the analysis as conversation metadata, so
  the analyzer knows what the persona is meant to do.
- Turn numbers in results count assistant turns from 1.

Batch analysis with dashboard storage takes up to 300 conversations, each
with a `conversation_id`, and returns synchronously. The request body is
capped at 5 MB, so a batch near the count limit must consist of short
conversations. `webhook_url` is a legacy per-request callback: the API POSTs
an unsigned `ingestion_complete` JSON summary there when the batch completes.
The signed `oversight.ingestion.complete` event is delivered to webhooks
registered with `client.webhooks`.

```typescript
import { NopeClient } from '@nope-net/sdk';

const client = new NopeClient({ apiKey: process.env.NOPE_API_KEY });

const batch = await client.oversight.ingest({
  conversations: [
    {
      conversation_id: 'conv_001',
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ],
    },
  ],
  webhook_url: 'https://api.example.com/webhooks/nope',
});

console.log(batch.status, `${batch.conversations_processed}/${batch.conversations_received}`, batch.dashboard_url);
for (const item of batch.results ?? []) {
  console.log(item.conversation_id, item.overall_concern, item.truncation_warnings?.map((w) => w.type));
}
```

## Signpost

Crisis resources by country. Filters can be passed at the top level or under
`config`; scope and population values come from the exported `ServiceScope`
and `Population` unions (`SERVICE_SCOPES`, `POPULATIONS`), and the API
returns 400 for unknown values.

```typescript
import { NopeClient } from '@nope-net/sdk';

const client = new NopeClient({ apiKey: process.env.NOPE_API_KEY });

// Basic lookup (free, key required). urgent: true keeps every match and ranks the
// 24/7 ones first among resources tied on relevance and priority tier.
const basic = await client.signpost({ country: 'GB', scopes: ['suicide'], subdivisions: ['GB-NIR'], urgent: true });
for (const resource of basic.resources) {
  console.log(resource.type, resource.name, resource.is_24_7, resource.phone ?? resource.website_url, resource.open_status?.message);
}

// Ranked for a described situation ($0.001 per call, up to 5 picks)
const ranked = await client.signpostSmart({ country: 'US', query: 'teen struggling with an eating disorder' });
for (const pick of ranked.ranked) {
  console.log(`${pick.rank}. ${pick.resource.name}: ${pick.why}`);
}

// Semantic search across the whole directory (free, key required)
const hits = await client.signpostSearch({ query: 'lgbtq youth support', country: 'GB', limit: 5 });
for (const hit of hits.results) {
  console.log(hit.id, hit.name, hit.similarity.toFixed(2), hit.phone ?? hit.website_url);
}

// Public routes (no key)
const one = await client.signpostById(hits.results[0].id);
const countries = await client.signpostCountries();
const geo = await client.detectCountry({ countryHint: 'GB' });
console.log(one.resource.name, countries.count, geo.detected ? geo.country_code : 'unknown');
```

`urgent: true` is a ranking hint, not a filter: the API keeps every
matching resource and, where two resources tie on relevance score and
priority tier, places the one flagged `is_24_7` first. Resources without
24/7 hours still appear in the list.

`detectCountry()` reads geo headers a proxy injects (`cf-ipcountry`,
`x-country`, `x-vercel-ip-country`). Called directly against api.nope.net it
returns the miss shape with `detected: false`; pass `countryHint` to send
`x-country` yourself.

`signpost()` and `signpostSearch()` need a key and are refused in demo mode.
The `resources*` methods still work against `/v1/resources/*`, log a
one-time deprecation warning, and stop on 2027-01-01.

## Webhooks

NOPE signs each delivery with HMAC-SHA256 over `"${timestamp}.${body}"` and
sends `X-NOPE-Signature`, `X-NOPE-Timestamp`, `X-NOPE-Event`,
`X-NOPE-Delivery-ID` and `X-NOPE-Webhook-ID`. Four events exist:

| Event | Sent when | Payload type |
|---|---|---|
| `evaluate.alert` | `/v1/evaluate` finds risk at or above the webhook's `min_risk_level` | `EvaluateAlertPayload` |
| `oversight.alert` | Oversight finds high or critical concern | `OversightAlertPayload` |
| `oversight.ingestion.complete` | An ingest batch finishes | `OversightIngestionCompletePayload` |
| `test.ping` | The dashboard test button or `client.webhooks.test()` | `TestPingPayload` |

Verify with the raw request body. Configure your framework so `req.body` is
the unparsed string or Buffer; a re-serialised object only matches the
signature when key order survived parsing.

```typescript
import { Webhook, WebhookSignatureError } from '@nope-net/sdk';

app.post('/webhooks/nope', (req, res) => {
  try {
    const { payload, deliveryId } = Webhook.verifyRequest(req.body, req.headers, process.env.NOPE_WEBHOOK_SECRET!);

    switch (payload.event) {
      case 'evaluate.alert':
        console.log(deliveryId, payload.conversation_id, payload.risk_summary.overall_severity);
        break;
      case 'oversight.alert':
        console.log(payload.conversation_id, payload.concern, payload.behaviors.map((b) => b.code));
        break;
      case 'oversight.ingestion.complete':
        console.log(payload.ingestion_id, payload.conversations_processed, payload.concerns.high);
        break;
      case 'test.ping':
        console.log(payload.message);
        break;
    }
    res.status(200).send('OK');
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      res.status(401).send('Invalid signature');
      return;
    }
    throw err;
  }
});
```

`Webhook.verify(body, signature, timestamp, secret, { maxAgeSeconds })`
takes the two header values directly. `maxAgeSeconds` defaults to 300;
`0` disables the timestamp check. `verifyRequest` also returns
`deliveryId` (the `X-NOPE-Delivery-ID` header: the stored delivery's id,
repeated on each of the API's four retry attempts over an hour, so it is
the key to deduplicate them), `eventType` (`X-NOPE-Event`) and `webhookId`
(`X-NOPE-Webhook-ID`). `deliveryId` is not `payload.event_id`, and it is
`undefined` when the header is absent, as on a body signed locally with
`Webhook.sign`. `eventId` is a deprecated alias of `deliveryId`.

For tests, `Webhook.sign(body, secret, timestamp?)` produces the signature
and timestamp the API would send. The optional third argument (unix
seconds) fixes the moment the signature is bound to, which is how to
exercise the stale-timestamp path:

```typescript
import { Webhook, WebhookSignatureError } from '@nope-net/sdk';

const body = JSON.stringify({
  event: 'test.ping',
  event_id: 'evt_local',
  timestamp: new Date().toISOString(),
  api_version: '2025-01',
  message: 'Webhook configured successfully',
});
const { signature, timestamp } = Webhook.sign(body, 'whsec_local');
const payload = Webhook.verify(body, signature, timestamp, 'whsec_local');
console.log(payload.event);

const stale = Webhook.sign(body, 'whsec_local', Math.floor(Date.now() / 1000) - 600);
try {
  Webhook.verify(body, stale.signature, stale.timestamp, 'whsec_local');
} catch (err) {
  console.log(err instanceof WebhookSignatureError, (err as Error).message); // true, "Timestamp too old: 600s ago (max: 300s)"
}
```

### Managing webhook endpoints

`client.webhooks` wraps `/v1/webhooks` (key required; creating an endpoint
needs a paid plan, which surfaces as `NopeFeatureError` with `upgradeUrl`).

```typescript
import { NopeClient } from '@nope-net/sdk';

const client = new NopeClient({ apiKey: process.env.NOPE_API_KEY });

const created = await client.webhooks.create({
  url: 'https://api.example.com/webhooks/nope',
  min_risk_level: 'high',
  include_conversation: false,
});
console.log(created.id, created.secret); // secret is returned once

const ping = await client.webhooks.test(created.id);
console.log(ping.success, ping.http_status, ping.duration_ms); // a failed delivery comes back with success: false

const { webhooks } = await client.webhooks.list();
const { events } = await client.webhooks.events(created.id, { limit: 10 });
await client.webhooks.update(created.id, { enabled: false });
const rotated = await client.webhooks.regenerateSecret(created.id);
await client.webhooks.delete(created.id);
console.log(webhooks.length, events.length, rotated.secret.length);
```

## Billing

Amounts are in mills (1 mill = $0.001). `pricing()` needs no key; the rest
need one. All five are refused in demo mode.

```typescript
import { NopeClient } from '@nope-net/sdk';

const client = new NopeClient({ apiKey: process.env.NOPE_API_KEY });

const balance = await client.billing.balance();
console.log(balance.balance_formatted, balance.low_balance, balance.estimated_evaluates);

const usage = await client.billing.usage({ start_date: '2026-09-01' });
for (const line of usage.breakdown) {
  console.log(line.endpoint, line.calls, line.cost_formatted);
}

const history = await client.billing.usageHistory({ limit: 20, endpoint: '/v1/evaluate' });
console.log(history.total, history.records[0]?.created_at);

const pricing = await client.billing.pricing();
console.log(pricing.pricing.evaluate.cost_display, pricing.free_credit_display);

const checkout = await client.billing.topup({ amount_mills: 10000, success_url: 'https://example.com/billing/ok' });
console.log(checkout.checkout_url);
```

## Errors, retries and response metadata

Every error extends `NopeError` and carries `statusCode`, `code`, `message`,
`responseBody` (the raw response text) and `body` (the same text parsed,
when it was a JSON object).

| Status | Class | Extra fields |
|---|---|---|
| 400, 413 | `NopeValidationError` | `details` (body extras such as `max_bytes`, `max_messages`, `invalid_scopes`) |
| 401 | `NopeAuthError` | |
| 402 | `NopeInsufficientBalanceError` | `balanceMills`, `requiredMills`, `formattedCurrent`, `formattedRequired`, `topupUrl`; ingest adds `perConversationMills`, `conversations` |
| 403 | `NopeFeatureError` | `feature`, `requiredAccess`, or `feature: 'paid_plan'` with `upgradeUrl` |
| 404 | `NopeNotFoundError` | |
| 429 | `NopeRateLimitError` | `retryAfter` (seconds), `limit`, `remaining`, `reset` (epoch ms) |
| 503 | `NopeServiceUnavailableError` | `retryAfter` (seconds); extends `NopeServerError` |
| other 5xx | `NopeServerError` | `retryAfter` when a header was sent |
| no response | `NopeConnectionError` | `originalError`; covers the client-side timeout |

Client-side validation (an empty `messages` array, a role other than
`user` or `assistant`, more than 100 messages, neither `messages` nor
`text`, and the per-method checks above) and demo-mode refusals throw
`NopeValidationError` before any request is sent. Those errors have no
`statusCode`; their `code` is `invalid_request` or
`not_available_in_demo`, and `details` is empty.

For API errors, `code` is present only when the API sends a machine string
in the body. Today 402 and 429 always do (`insufficient_balance`,
`rate_limit_exceeded`), 403 and 503 do on some bodies
(`paid_plan_required`, `auth_unavailable`), and 400, 401, 404 and 413 carry
a sentence, so `code` is `undefined` there. Branch on the class or on
`statusCode`, and read `code` only as extra detail.

```typescript
import {
  NopeClient,
  NopeAuthError,
  NopeInsufficientBalanceError,
  NopeRateLimitError,
  NopeValidationError,
  NopeServiceUnavailableError,
  NopeServerError,
  NopeConnectionError,
} from '@nope-net/sdk';

const client = new NopeClient({ apiKey: process.env.NOPE_API_KEY, maxRetries: 2 });

try {
  const result = await client.evaluate({ text: 'hello', config: { country: 'US' } });
  console.log(result.speaker_severity);
  console.log(client.lastResponseMeta?.balance?.costMills, client.lastResponseMeta?.rateLimit?.remaining);
} catch (error) {
  if (error instanceof NopeInsufficientBalanceError) {
    console.log(`Balance ${error.formattedCurrent}, need ${error.formattedRequired}: ${error.topupUrl}`);
  } else if (error instanceof NopeRateLimitError) {
    console.log(`Rate limited; retry after ${error.retryAfter} seconds`);
  } else if (error instanceof NopeValidationError) {
    // statusCode is undefined when the SDK rejected the input before sending (code 'invalid_request').
    console.log(error.statusCode ?? 'client-side', error.code, error.message, error.details);
  } else if (error instanceof NopeAuthError) {
    console.log('Invalid API key');
  } else if (error instanceof NopeServiceUnavailableError) {
    console.log(`Temporarily unavailable; retry after ${error.retryAfter} seconds`);
  } else if (error instanceof NopeServerError) {
    console.log(`Server error ${error.statusCode}`, error.body?.error ?? error.responseBody);
  } else if (error instanceof NopeConnectionError) {
    console.log('No response', error.originalError?.message);
  } else {
    throw error;
  }
}
```

The client retries 429 and 503 responses up to `maxRetries` times, waiting
`Retry-After` seconds (falling back to the body's `retry_after_seconds`,
then to 1 s, 2 s, 4 s), capped at 30 s per wait. Timeouts, connection
failures and other 5xx are never retried: paid routes charge before the
handler runs, so a blind retry could bill twice.

`client.lastResponseMeta` holds `{ status, rateLimit, balance }` from the
most recent response. `rateLimit` comes from the `X-RateLimit-*` headers on
every route; `balance` (`balanceMills`, `costMills`) is present on paid
routes only.

## TypeScript

Every request and response type is exported. `NopeClient` is generic on the
`demo` flag, so `oversight.analyze` and `ocular` return the demo response
types on a demo client and the authenticated types otherwise. Annotate a
client that may be either as `NopeClient<boolean>`.

```typescript
import type {
  EvaluateResponse,
  EvaluateResource,
  Risk,
  CrisisResource,
  OcularResponse,
  OversightAnalyzeResponse,
  OversightBehaviorCode,
  SignpostSearchResult,
  WebhookPayload,
  ServiceScope,
} from '@nope-net/sdk';
import { NopeClient } from '@nope-net/sdk';

const eitherClient: NopeClient<boolean> = new NopeClient({ demo: true });
const scope: ServiceScope = 'domestic_violence';
const code: OversightBehaviorCode = 'dependency_reinforcement';
console.log(typeof eitherClient, scope, code);
```

## Versioning

The package follows [Semantic Versioning](https://semver.org/). 4.0.0 is a
breaking release; see [CHANGELOG.md](CHANGELOG.md) for every change from
3.x, including the switch of `retryAfter` to seconds and the removed
response fields.

## License

MIT. See [LICENSE](LICENSE).

## Support

- API reference: [docs.nope.net](https://docs.nope.net)
- Dashboard: [dashboard.nope.net](https://dashboard.nope.net)
- Issues: [github.com/nope-net/node-sdk/issues](https://github.com/nope-net/node-sdk/issues)
