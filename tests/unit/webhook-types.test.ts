/**
 * Compile-time pins for the webhook payload union.
 */

import { describe, it, expectTypeOf } from 'vitest';
import type {
  EvaluateAlertPayload,
  OversightAlertPayload,
  OversightIngestionCompletePayload,
  TestPingPayload,
  VerifiedWebhook,
  WebhookEventType,
  WebhookPayload,
} from '../../src/index.js';
import { Webhook } from '../../src/index.js';

describe('Webhook types (compile-time)', () => {
  it('has the four real event names and a discriminated union', () => {
    expectTypeOf<WebhookEventType>().toEqualTypeOf<
      'evaluate.alert' | 'oversight.alert' | 'oversight.ingestion.complete' | 'test.ping'
    >();
    expectTypeOf<WebhookPayload>().toEqualTypeOf<
      EvaluateAlertPayload | OversightAlertPayload | OversightIngestionCompletePayload | TestPingPayload
    >();
    expectTypeOf<Extract<WebhookPayload, { event: 'test.ping' }>>().toEqualTypeOf<TestPingPayload>();
    expectTypeOf<TestPingPayload['message']>().toEqualTypeOf<string>();
    expectTypeOf<OversightAlertPayload['concern']>().toEqualTypeOf<'high' | 'critical'>();
    expectTypeOf<OversightIngestionCompletePayload['concerns']['critical']>().toEqualTypeOf<number>();
    expectTypeOf<EvaluateAlertPayload['flags']['third_party_threat']>().toEqualTypeOf<boolean>();
  });

  it('verify returns the union; verifyRequest wraps it with ids', () => {
    expectTypeOf(Webhook.verify).returns.toEqualTypeOf<WebhookPayload>();
    expectTypeOf(Webhook.verifyRequest).returns.toEqualTypeOf<VerifiedWebhook>();
    expectTypeOf<VerifiedWebhook['eventId']>().toEqualTypeOf<string | undefined>();
  });
});
