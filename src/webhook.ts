/**
 * Webhook Utilities
 *
 * Verify incoming webhook signatures and parse payloads.
 *
 * @example
 * ```typescript
 * import { Webhook, WebhookPayload } from '@nope-net/sdk';
 *
 * app.post('/webhooks/nope', (req, res) => {
 *   try {
 *     const event = Webhook.verify(
 *       req.body,
 *       req.headers['x-nope-signature'] as string,
 *       req.headers['x-nope-timestamp'] as string,
 *       process.env.NOPE_WEBHOOK_SECRET!
 *     );
 *
 *     console.log(`Received ${event.event}: ${event.risk_summary.overall_severity}`);
 *     res.status(200).send('OK');
 *   } catch (err) {
 *     console.error('Webhook verification failed:', err);
 *     res.status(401).send('Invalid signature');
 *   }
 * });
 * ```
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type { Severity, Imminence } from './types.js';

// =============================================================================
// Webhook Types
// =============================================================================

/** Webhook event types */
export type WebhookEventType = 'risk.elevated' | 'risk.critical' | 'test.ping';

/** Risk level thresholds for webhook configuration */
export type WebhookRiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

/** Risk summary in webhook payload */
export interface WebhookRiskSummary {
  overall_severity: Severity;
  overall_imminence: Imminence;
  primary_domain: string;
  confidence: number;
  primary_concerns: string;
}

/** Domain assessment in webhook payload */
export interface WebhookDomainAssessment {
  domain: string;
  severity: Severity;
  imminence: Imminence;
}

/** Legal/safeguarding flags in webhook payload */
export interface WebhookFlags {
  intimate_partner_violence: string | null;
  child_safeguarding: string | null;
  third_party_threat: boolean;
}

/** Resource reference in webhook payload */
export interface WebhookResourceProvided {
  name: string;
  type: string;
  country: string;
}

/** Conversation info in webhook payload */
export interface WebhookConversation {
  included: boolean;
  message_count?: number;
  latest_user_message?: string;
  truncated?: boolean;
}

/**
 * Webhook payload received from NOPE
 *
 * This is the body of the POST request sent to your webhook endpoint.
 */
export interface WebhookPayload {
  /** Event type: risk.elevated, risk.critical, or test.ping */
  event: WebhookEventType;

  /** Unique event ID for idempotency */
  event_id: string;

  /** ISO 8601 timestamp when event was created */
  timestamp: string;

  /** API version for payload format */
  api_version: '2025-01';

  /** Your conversation_id (if provided in evaluate request) */
  conversation_id?: string;

  /** Your end_user_id (if provided in evaluate request) */
  user_id?: string;

  /** Risk assessment summary */
  risk_summary: WebhookRiskSummary;

  /** Per-domain risk assessments */
  domains: WebhookDomainAssessment[];

  /** Legal/safeguarding flags */
  flags: WebhookFlags;

  /** Crisis resources that were provided */
  resources_provided: WebhookResourceProvided[];

  /** Conversation content (if include_conversation enabled) */
  conversation: WebhookConversation;
}

// =============================================================================
// Errors
// =============================================================================

/**
 * Error thrown when webhook signature verification fails
 */
export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookSignatureError';
  }
}

// =============================================================================
// Webhook Verification
// =============================================================================

export interface WebhookVerifyOptions {
  /**
   * Maximum age of timestamp in seconds (default: 300 = 5 minutes)
   *
   * Set to 0 to disable timestamp checking (not recommended).
   */
  maxAgeSeconds?: number;
}

/**
 * Webhook verification and parsing utilities
 */
export const Webhook = {
  /**
   * Verify webhook signature and parse payload
   *
   * @param payload - Raw request body (string or object)
   * @param signature - X-NOPE-Signature header value
   * @param timestamp - X-NOPE-Timestamp header value
   * @param secret - Your webhook signing secret
   * @param options - Verification options
   * @returns Parsed and verified WebhookPayload
   * @throws WebhookSignatureError if verification fails
   *
   * @example
   * ```typescript
   * const event = Webhook.verify(
   *   req.body,
   *   req.headers['x-nope-signature'],
   *   req.headers['x-nope-timestamp'],
   *   secret
   * );
   * ```
   */
  verify(
    payload: string | object,
    signature: string | undefined,
    timestamp: string | undefined,
    secret: string,
    options: WebhookVerifyOptions = {}
  ): WebhookPayload {
    const { maxAgeSeconds = 300 } = options;

    // Validate inputs
    if (!signature) {
      throw new WebhookSignatureError('Missing X-NOPE-Signature header');
    }
    if (!timestamp) {
      throw new WebhookSignatureError('Missing X-NOPE-Timestamp header');
    }
    if (!secret) {
      throw new WebhookSignatureError('Webhook secret is required');
    }

    // Parse timestamp
    const timestampNum = parseInt(timestamp, 10);
    if (isNaN(timestampNum)) {
      throw new WebhookSignatureError('Invalid timestamp format');
    }

    // Check timestamp freshness
    if (maxAgeSeconds > 0) {
      const now = Math.floor(Date.now() / 1000);
      const age = now - timestampNum;

      if (age > maxAgeSeconds) {
        throw new WebhookSignatureError(
          `Timestamp too old: ${age}s ago (max: ${maxAgeSeconds}s)`
        );
      }
      if (age < -maxAgeSeconds) {
        throw new WebhookSignatureError(
          `Timestamp too far in future: ${-age}s ahead (max: ${maxAgeSeconds}s)`
        );
      }
    }

    // Stringify payload if object
    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);

    // Compute expected signature
    const message = `${timestamp}.${payloadString}`;
    const expected = createHmac('sha256', secret).update(message).digest('hex');

    // Extract signature value (remove sha256= prefix if present)
    const received = signature.replace(/^sha256=/, '');

    // Constant-time comparison
    let isValid = false;
    try {
      isValid = timingSafeEqual(Buffer.from(expected), Buffer.from(received));
    } catch {
      // Lengths don't match
      isValid = false;
    }

    if (!isValid) {
      throw new WebhookSignatureError('Signature verification failed');
    }

    // Parse and return payload
    const parsed: WebhookPayload =
      typeof payload === 'string' ? JSON.parse(payload) : payload;

    return parsed;
  },

  /**
   * Generate a signature for testing purposes
   *
   * @param payload - Payload to sign (string or object)
   * @param secret - Signing secret
   * @param timestamp - Unix timestamp in seconds (defaults to now)
   * @returns Object with signature and timestamp
   *
   * @example
   * ```typescript
   * const { signature, timestamp } = Webhook.sign(payload, secret);
   * ```
   */
  sign(
    payload: string | object,
    secret: string,
    timestamp?: number
  ): { signature: string; timestamp: string } {
    const ts = timestamp ?? Math.floor(Date.now() / 1000);
    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const message = `${ts}.${payloadString}`;
    const sig = createHmac('sha256', secret).update(message).digest('hex');

    return {
      signature: `sha256=${sig}`,
      timestamp: String(ts),
    };
  },
};
