/**
 * Webhook verification and payload types.
 *
 * NOPE signs every delivery with HMAC-SHA256 over `"${timestamp}.${body}"`
 * where `body` is the exact bytes it sent (JSON.stringify of the payload),
 * and sets these headers:
 *
 *   X-NOPE-Signature:   sha256=<hex>
 *   X-NOPE-Timestamp:   <unix seconds>
 *   X-NOPE-Event:       evaluate.alert | oversight.alert | oversight.ingestion.complete | test.ping
 *   X-NOPE-Delivery-ID: evt_<32 hex>
 *   X-NOPE-Webhook-ID:  <webhook id>
 *
 * Pass the raw request body (string or bytes) to `verify` / `verifyRequest`.
 * Passing an already-parsed object also works (the SDK re-serialises it with
 * JSON.stringify), but only when your JSON parser preserved key order, so the
 * raw body is the supported input.
 *
 * @example
 * ```typescript
 * import { Webhook, WebhookSignatureError } from '@nope-net/sdk';
 *
 * app.post('/webhooks/nope', express.raw({ type: 'application/json' }), (req, res) => {
 *   try {
 *     const { payload } = Webhook.verifyRequest(req.body, req.headers, process.env.NOPE_WEBHOOK_SECRET!);
 *     if (payload.event === 'evaluate.alert') {
 *       console.log(payload.risk_summary.overall_severity);
 *     }
 *     res.status(200).send('OK');
 *   } catch (err) {
 *     if (err instanceof WebhookSignatureError) res.status(401).send('Invalid signature');
 *     else throw err;
 *   }
 * });
 * ```
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Severity, Imminence, ConcernLevel, Trajectory } from './types.js';

// =============================================================================
// Payload types (copied field-for-field from api/lib/webhooks/types.ts)
// =============================================================================

/** Webhook event types. */
export type WebhookEventType = 'evaluate.alert' | 'oversight.alert' | 'oversight.ingestion.complete' | 'test.ping';

/** Risk level threshold for webhook filtering (`min_risk_level`). */
export type WebhookRiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

/** Risk summary on an evaluate.alert payload. */
export interface WebhookRiskSummary {
  overall_severity: Severity;
  overall_imminence: Imminence;
  /** Risk type of the highest self-directed risk, or 'none'. */
  primary_domain: string;
  confidence: number;
  /**
   * Narrative of the key concerns. Declared as a string by the API; the
   * builder copies the classifier's value through, which has been seen as an
   * array of strings on the wire.
   */
  primary_concerns: string | string[];
}

/** Per-risk assessment on an evaluate.alert payload. */
export interface WebhookDomainAssessment {
  domain: string;
  severity: Severity;
  imminence: Imminence;
}

/** Safeguarding flags on an evaluate.alert payload. */
export interface WebhookFlags {
  intimate_partner_violence: string | null;
  child_safeguarding: string | null;
  third_party_threat: boolean;
}

/** A resource that was included in the API response. */
export interface WebhookResourceProvided {
  name: string;
  type: string;
  country: string;
}

/** Conversation content (only when the webhook has include_conversation). */
export interface WebhookConversation {
  included: boolean;
  message_count?: number;
  /** Latest user message, truncated to 1,000 characters. */
  latest_user_message?: string;
  truncated?: boolean;
}

/** Fields shared by every event. */
export interface WebhookPayloadBase {
  /** Event type. */
  event: WebhookEventType;

  /** Unique event id for idempotency (also sent as X-NOPE-Delivery-ID). */
  event_id: string;

  /** ISO 8601 creation time. */
  timestamp: string;

  /** Payload format version. */
  api_version: '2025-01';
}

/** Sent when /v1/evaluate detects risk at or above the webhook's min_risk_level. */
export interface EvaluateAlertPayload extends WebhookPayloadBase {
  event: 'evaluate.alert';

  /** Your conversation_id from the evaluate request, if any. */
  conversation_id?: string;

  /** Your end_user_id from the evaluate request, if any. */
  user_id?: string;

  risk_summary: WebhookRiskSummary;

  /** Per-domain assessments. */
  domains: WebhookDomainAssessment[];

  flags: WebhookFlags;

  /** Resources that were provided in the API response. */
  resources_provided: WebhookResourceProvided[];

  conversation: WebhookConversation;
}

/** A behavior on an oversight.alert payload (up to 5). */
export interface OversightAlertBehavior {
  code: string;
  name: string;
  severity: string;
  category: string;
}

/** Sent when Oversight (analyze or ingest) finds high or critical concern. */
export interface OversightAlertPayload extends WebhookPayloadBase {
  event: 'oversight.alert';

  conversation_id: string;

  /** Concern level that triggered the alert. */
  concern: 'high' | 'critical';

  trajectory: Trajectory;

  /** Human-readable summary of the analysis. */
  summary: string;

  /** Top behaviors detected (up to 5). */
  behaviors: OversightAlertBehavior[];

  /** Agent ids involved in the conversation. */
  agent_ids?: string[];

  /** Platform from the conversation metadata. */
  platform?: string;

  user_is_minor: boolean;

  /** Conversation content (only when the webhook has include_conversation). */
  conversation?: WebhookConversation;
}

/** Sent when an ingest batch finishes. */
export interface OversightIngestionCompletePayload extends WebhookPayloadBase {
  event: 'oversight.ingestion.complete';

  ingestion_id: string;

  conversations_total: number;

  conversations_processed: number;

  conversations_failed: number;

  /** Count of conversations at each concern level. */
  concerns: Record<ConcernLevel, number>;

  /** Top behaviors across the batch. */
  top_behaviors: Array<{
    code: string;
    name: string;
    occurrence_count: number;
  }>;

  processing_time_ms: number;
}

/** Sent by the dashboard "test" button and by client.webhooks.test(). */
export interface TestPingPayload extends WebhookPayloadBase {
  event: 'test.ping';

  message: string;
}

/** Every webhook payload, discriminated on `event`. */
export type WebhookPayload =
  | EvaluateAlertPayload
  | OversightAlertPayload
  | OversightIngestionCompletePayload
  | TestPingPayload;

// =============================================================================
// Errors
// =============================================================================

/** Thrown when signature verification fails or the timestamp is out of range. */
export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookSignatureError';
  }
}

// =============================================================================
// Verification
// =============================================================================

export interface WebhookVerifyOptions {
  /**
   * Maximum age of the timestamp in seconds, in either direction (default
   * 300). Set to 0 to disable the check (not recommended).
   */
  maxAgeSeconds?: number;
}

/** Raw body (string or bytes, preferred) or an already-parsed object. */
export type WebhookBody = string | Uint8Array | object;

/** Node's IncomingHttpHeaders, a fetch Headers instance, or any header map. */
export type WebhookHeaders =
  | { get(name: string): string | null }
  | Record<string, string | string[] | undefined>;

/** Result of verifyRequest. */
export interface VerifiedWebhook {
  /** The verified, parsed payload. */
  payload: WebhookPayload;
  /** X-NOPE-Delivery-ID (equals payload.event_id). Use it to deduplicate retries. */
  eventId?: string;
  /** X-NOPE-Webhook-ID. */
  webhookId?: string;
  /** X-NOPE-Event. */
  eventType?: string;
}

const DEFAULT_MAX_AGE_SECONDS = 300;

function toBytes(body: WebhookBody): Buffer {
  if (typeof body === 'string') return Buffer.from(body, 'utf8');
  if (body instanceof Uint8Array) return Buffer.from(body);
  return Buffer.from(JSON.stringify(body), 'utf8');
}

function computeSignature(secret: string, timestamp: string, bodyBytes: Buffer): string {
  return createHmac('sha256', secret).update(`${timestamp}.`).update(bodyBytes).digest('hex');
}

function readHeader(headers: WebhookHeaders, name: string): string | undefined {
  if (typeof (headers as { get?: unknown }).get === 'function') {
    return (headers as { get(name: string): string | null }).get(name) ?? undefined;
  }
  const map = headers as Record<string, string | string[] | undefined>;
  const key = Object.keys(map).find((k) => k.toLowerCase() === name);
  const value = key === undefined ? undefined : map[key];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Webhook verification and signing.
 */
export const Webhook = {
  /**
   * Verify a delivery and return its parsed payload.
   *
   * @param payload - Raw request body (string or bytes, preferred) or the parsed object
   * @param signature - X-NOPE-Signature header value
   * @param timestamp - X-NOPE-Timestamp header value (unix seconds)
   * @param secret - Your webhook signing secret (`whsec_...`)
   * @param options - `maxAgeSeconds` (default 300; 0 disables)
   * @throws WebhookSignatureError when a header is missing, the timestamp is out of range, or the signature does not match
   */
  verify(
    payload: WebhookBody,
    signature: string | undefined,
    timestamp: string | undefined,
    secret: string,
    options: WebhookVerifyOptions = {}
  ): WebhookPayload {
    const { maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS } = options;

    if (!signature) throw new WebhookSignatureError('Missing X-NOPE-Signature header');
    if (!timestamp) throw new WebhookSignatureError('Missing X-NOPE-Timestamp header');
    if (!secret) throw new WebhookSignatureError('Webhook secret is required');

    const timestampNum = Number.parseInt(timestamp, 10);
    if (Number.isNaN(timestampNum)) throw new WebhookSignatureError('Invalid timestamp format');

    if (maxAgeSeconds > 0) {
      const age = Math.floor(Date.now() / 1000) - timestampNum;
      if (age > maxAgeSeconds) {
        throw new WebhookSignatureError(`Timestamp too old: ${age}s ago (max: ${maxAgeSeconds}s)`);
      }
      if (age < -maxAgeSeconds) {
        throw new WebhookSignatureError(`Timestamp too far in future: ${-age}s ahead (max: ${maxAgeSeconds}s)`);
      }
    }

    const bodyBytes = toBytes(payload);
    const expected = Buffer.from(computeSignature(secret, timestamp, bodyBytes));
    const received = Buffer.from(signature.replace(/^sha256=/, ''));
    const valid = expected.length === received.length && timingSafeEqual(expected, received);
    if (!valid) throw new WebhookSignatureError('Signature verification failed');

    if (typeof payload === 'string' || payload instanceof Uint8Array) {
      return JSON.parse(bodyBytes.toString('utf8')) as WebhookPayload;
    }
    return payload as WebhookPayload;
  },

  /**
   * Verify a delivery from its raw body and request headers.
   *
   * Reads `x-nope-signature` and `x-nope-timestamp` (case-insensitive) from
   * a Node `IncomingHttpHeaders` object, a fetch `Headers` instance, or any
   * plain map, and returns the payload with the delivery and webhook ids.
   *
   * @param body - Raw request body (string or bytes, preferred) or the parsed object
   * @param headers - Request headers
   * @param secret - Your webhook signing secret
   * @param options - `maxAgeSeconds` (default 300; 0 disables)
   */
  verifyRequest(
    body: WebhookBody,
    headers: WebhookHeaders,
    secret: string,
    options: WebhookVerifyOptions = {}
  ): VerifiedWebhook {
    const payload = Webhook.verify(
      body,
      readHeader(headers, 'x-nope-signature'),
      readHeader(headers, 'x-nope-timestamp'),
      secret,
      options
    );
    return {
      payload,
      eventId: readHeader(headers, 'x-nope-delivery-id'),
      webhookId: readHeader(headers, 'x-nope-webhook-id'),
      eventType: readHeader(headers, 'x-nope-event'),
    };
  },

  /**
   * Sign a body the way the API does (for tests and local replay).
   *
   * @param payload - Body to sign: a string or bytes as-is, or an object serialised with JSON.stringify
   * @param secret - Signing secret
   * @param timestamp - Unix seconds (defaults to now)
   * @returns `signature` (`sha256=<hex>`) and `timestamp` as strings
   */
  sign(payload: WebhookBody, secret: string, timestamp?: number): { signature: string; timestamp: string } {
    const ts = String(timestamp ?? Math.floor(Date.now() / 1000));
    return {
      signature: `sha256=${computeSignature(secret, ts, toBytes(payload))}`,
      timestamp: ts,
    };
  },
};

// =============================================================================
// Management types (client.webhooks.*; api/src/routes/v1/webhooks.ts)
// =============================================================================

/** Body of client.webhooks.create(). */
export interface WebhookCreateOptions {
  /** HTTPS endpoint (http is accepted for localhost only; private ranges are rejected). */
  url: string;
  /** Minimum risk level that triggers a delivery (default 'high'). */
  min_risk_level?: WebhookRiskLevel;
  /** Include the latest user message in payloads (default false). */
  include_conversation?: boolean;
}

/** Body of client.webhooks.update(). */
export interface WebhookUpdateOptions {
  url?: string;
  min_risk_level?: WebhookRiskLevel;
  enabled?: boolean;
  include_conversation?: boolean;
}

/** A webhook configuration. `secret` is present only on create and regenerateSecret. */
export interface WebhookResponse {
  id: string;
  url: string;
  min_risk_level: WebhookRiskLevel;
  enabled: boolean;
  include_conversation: boolean;
  created_at: string;
  updated_at: string;
  /** Signing secret (`whsec_...`). Returned once, on create. */
  secret?: string;
}

/** Response from client.webhooks.list(). */
export interface WebhookListResponse {
  webhooks: WebhookResponse[];
}

/** Response from client.webhooks.delete(). */
export interface WebhookDeleteResponse {
  success: true;
}

/** Response from client.webhooks.regenerateSecret(). */
export interface WebhookSecretResponse {
  /** The new signing secret. The old one stops working immediately. */
  secret: string;
}

/** Result of a delivery attempt (client.webhooks.test()). */
export interface WebhookDeliveryResult {
  success: boolean;
  http_status?: number;
  error_message?: string;
  duration_ms: number;
}

/** Delivery status of a stored event. */
export type WebhookDeliveryStatus = 'pending' | 'sent' | 'failed';

/** A stored delivery (client.webhooks.events()). */
export interface WebhookEvent {
  id: string;
  webhook_id: string;
  event_type: WebhookEventType;
  payload: WebhookPayload;
  status: WebhookDeliveryStatus;
  http_status?: number;
  error_message?: string;
  /** Attempts so far (the API retries 4 times: immediately, 1 min, 10 min, 1 h). */
  attempt_count: number;
  last_attempt_at?: string;
  next_retry_at?: string;
  created_at: string;
}

/** Options for client.webhooks.events(). */
export interface WebhookEventsOptions {
  /** Max events (default 50, max 100). */
  limit?: number;
}

/** Response from client.webhooks.events(). */
export interface WebhookEventsResponse {
  events: WebhookEvent[];
}
