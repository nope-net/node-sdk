/**
 * Webhook.verify / verifyRequest / sign against the four signed fixtures in
 * tests/fixtures/webhooks (built by the API's own payload builders, signed
 * with a fixed test secret). The body string is the signed bytes; verify
 * must accept it byte for byte, and the object path must reproduce it.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Webhook, WebhookSignatureError } from '../../src/webhook.js';

interface SignedFixture {
  event: string;
  secret: string;
  headers: Record<string, string>;
  body: string;
  payload: Record<string, unknown>;
}

const FIXTURE_NAMES = ['evaluate.alert', 'oversight.alert', 'oversight.ingestion.complete', 'test.ping'] as const;
const fixtures = Object.fromEntries(
  FIXTURE_NAMES.map((name) => [
    name,
    JSON.parse(readFileSync(new URL(`../fixtures/webhooks/${name}.json`, import.meta.url), 'utf8')) as SignedFixture,
  ])
) as Record<(typeof FIXTURE_NAMES)[number], SignedFixture>;

const SIGNED_AT = 1788396900;

describe('Webhook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date((SIGNED_AT + 30) * 1000));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  for (const name of FIXTURE_NAMES) {
    const fx = fixtures[name];

    it(`verify(string) accepts the signed ${name} body`, () => {
      const payload = Webhook.verify(fx.body, fx.headers['x-nope-signature'], fx.headers['x-nope-timestamp'], fx.secret);
      expect(payload).toEqual(fx.payload);
      expect(payload.event).toBe(name);
      expect(payload.api_version).toBe('2025-01');
    });

    it(`verifyRequest(headers map) accepts ${name} and returns deliveryId / webhookId / eventType`, () => {
      const result = Webhook.verifyRequest(fx.body, fx.headers, fx.secret);
      expect(result.payload).toEqual(fx.payload);
      expect(result.deliveryId).toBe(fx.headers['x-nope-delivery-id']);
      // Deprecated alias of the same header value.
      expect(result.eventId).toBe(result.deliveryId);
      expect(result.webhookId).toBe('wh_fixture_0001');
      expect(result.eventType).toBe(name);
    });

    it(`verify(Buffer) accepts the raw ${name} bytes`, () => {
      const payload = Webhook.verify(Buffer.from(fx.body, 'utf8'), fx.headers['x-nope-signature'], fx.headers['x-nope-timestamp'], fx.secret);
      expect(payload).toEqual(fx.payload);
    });

    it(`sign(object) reproduces the API signature for ${name}`, () => {
      const { signature, timestamp } = Webhook.sign(fx.payload, fx.secret, SIGNED_AT);
      expect(signature).toBe(fx.headers['x-nope-signature']);
      expect(timestamp).toBe(fx.headers['x-nope-timestamp']);
    });
  }

  it('verify(object) on the non-ASCII evaluate.alert payload serialises to the signed bytes', () => {
    const fx = fixtures['evaluate.alert'];
    expect(fx.body).toMatch(/—/);
    const payload = Webhook.verify(fx.payload, fx.headers['x-nope-signature'], fx.headers['x-nope-timestamp'], fx.secret);
    expect(payload).toEqual(fx.payload);
    if (payload.event === 'evaluate.alert') {
      expect(payload.risk_summary.overall_severity).toBe('high');
      expect(payload.resources_provided[0].name).toBe('Línea de Prevención del Suicidio');
    }
  });

  it('verifyRequest accepts a fetch Headers instance and uppercase/array header maps', () => {
    const fx = fixtures['test.ping'];
    const viaHeaders = Webhook.verifyRequest(fx.body, new Headers(fx.headers), fx.secret);
    expect(viaHeaders.payload.event).toBe('test.ping');

    const upper: Record<string, string | string[] | undefined> = {
      'X-NOPE-Signature': [fx.headers['x-nope-signature']],
      'X-NOPE-Timestamp': fx.headers['x-nope-timestamp'],
      'X-NOPE-Delivery-ID': fx.headers['x-nope-delivery-id'],
    };
    const viaMap = Webhook.verifyRequest(fx.body, upper, fx.secret);
    expect(viaMap.eventId).toBe(fx.headers['x-nope-delivery-id']);
    expect(viaMap.webhookId).toBeUndefined();
  });

  it('narrows on event', () => {
    const fx = fixtures['oversight.alert'];
    const payload = Webhook.verify(fx.body, fx.headers['x-nope-signature'], fx.headers['x-nope-timestamp'], fx.secret);
    switch (payload.event) {
      case 'oversight.alert':
        expect(payload.concern).toBe('high');
        expect(payload.behaviors[0].category).toBe('boundary_violations');
        expect(payload.user_is_minor).toBe(false);
        break;
      default:
        throw new Error('expected oversight.alert');
    }
    const ingestion = Webhook.verify(
      fixtures['oversight.ingestion.complete'].body,
      fixtures['oversight.ingestion.complete'].headers['x-nope-signature'],
      fixtures['oversight.ingestion.complete'].headers['x-nope-timestamp'],
      fixtures['oversight.ingestion.complete'].secret
    );
    if (ingestion.event === 'oversight.ingestion.complete') {
      expect(ingestion.concerns.high).toBe(2);
      expect(ingestion.top_behaviors[0].occurrence_count).toBe(4);
    }
  });

  it('rejects a tampered body', () => {
    const fx = fixtures['evaluate.alert'];
    const tampered = fx.body.replace('"overall_severity":"high"', '"overall_severity":"none"');
    expect(tampered).not.toBe(fx.body);
    expect(() => Webhook.verify(tampered, fx.headers['x-nope-signature'], fx.headers['x-nope-timestamp'], fx.secret)).toThrow(
      WebhookSignatureError
    );
    expect(() => Webhook.verify(tampered, fx.headers['x-nope-signature'], fx.headers['x-nope-timestamp'], fx.secret)).toThrow(
      'Signature verification failed'
    );
  });

  it('rejects a wrong secret and a signature without the sha256= prefix still verifies', () => {
    const fx = fixtures['test.ping'];
    expect(() => Webhook.verify(fx.body, fx.headers['x-nope-signature'], fx.headers['x-nope-timestamp'], 'whsec_wrong')).toThrow(
      WebhookSignatureError
    );
    const bare = fx.headers['x-nope-signature'].replace(/^sha256=/, '');
    expect(Webhook.verify(fx.body, bare, fx.headers['x-nope-timestamp'], fx.secret).event).toBe('test.ping');
  });

  it('rejects a stale timestamp and one too far in the future (default 300 s)', () => {
    const fx = fixtures['test.ping'];
    vi.setSystemTime(new Date((SIGNED_AT + 301) * 1000));
    expect(() => Webhook.verify(fx.body, fx.headers['x-nope-signature'], fx.headers['x-nope-timestamp'], fx.secret)).toThrow(
      /Timestamp too old/
    );
    vi.setSystemTime(new Date((SIGNED_AT - 301) * 1000));
    expect(() => Webhook.verify(fx.body, fx.headers['x-nope-signature'], fx.headers['x-nope-timestamp'], fx.secret)).toThrow(
      /too far in future/
    );
    vi.setSystemTime(new Date((SIGNED_AT + 299) * 1000));
    expect(Webhook.verify(fx.body, fx.headers['x-nope-signature'], fx.headers['x-nope-timestamp'], fx.secret).event).toBe('test.ping');
  });

  it('maxAgeSeconds: 0 disables the age check', () => {
    const fx = fixtures['test.ping'];
    vi.setSystemTime(new Date((SIGNED_AT + 86_400 * 30) * 1000));
    const payload = Webhook.verify(fx.body, fx.headers['x-nope-signature'], fx.headers['x-nope-timestamp'], fx.secret, {
      maxAgeSeconds: 0,
    });
    expect(payload.event).toBe('test.ping');
    expect(() => Webhook.verifyRequest(fx.body, fx.headers, fx.secret)).toThrow(/Timestamp too old/);
    expect(Webhook.verifyRequest(fx.body, fx.headers, fx.secret, { maxAgeSeconds: 0 }).payload.event).toBe('test.ping');
  });

  it('rejects missing signature, timestamp or secret', () => {
    const fx = fixtures['test.ping'];
    expect(() => Webhook.verify(fx.body, undefined, fx.headers['x-nope-timestamp'], fx.secret)).toThrow(/Missing X-NOPE-Signature/);
    expect(() => Webhook.verify(fx.body, fx.headers['x-nope-signature'], undefined, fx.secret)).toThrow(/Missing X-NOPE-Timestamp/);
    expect(() => Webhook.verify(fx.body, fx.headers['x-nope-signature'], fx.headers['x-nope-timestamp'], '')).toThrow(/secret is required/);
    expect(() => Webhook.verify(fx.body, fx.headers['x-nope-signature'], 'soon', fx.secret)).toThrow(/Invalid timestamp/);
    expect(() => Webhook.verifyRequest(fx.body, {}, fx.secret)).toThrow(/Missing X-NOPE-Signature/);
  });

  it('verifyRequest without the delivery header: deliveryId undefined, payload.event_id untouched', () => {
    const body = '{"event":"test.ping","event_id":"evt_local","timestamp":"t","api_version":"2025-01","message":"hi"}';
    const { signature, timestamp } = Webhook.sign(body, 'whsec_abc');
    const result = Webhook.verifyRequest(
      body,
      { 'x-nope-signature': signature, 'x-nope-timestamp': timestamp },
      'whsec_abc'
    );
    expect(result.deliveryId).toBeUndefined();
    expect(result.eventId).toBeUndefined();
    expect(result.eventType).toBeUndefined();
    expect(result.webhookId).toBeUndefined();
    expect(result.payload.event_id).toBe('evt_local');
  });

  it('sign() with an explicit timestamp signs as of that time', () => {
    const body = '{"event":"test.ping","event_id":"evt_x","timestamp":"t","api_version":"2025-01","message":"hi"}';
    const at = SIGNED_AT - 200;
    const { signature, timestamp } = Webhook.sign(body, 'whsec_abc', at);
    expect(timestamp).toBe(String(at));
    // Now is SIGNED_AT + 30, so the signature is 230 s old: inside the window.
    expect(Webhook.verify(body, signature, timestamp, 'whsec_abc').event).toBe('test.ping');
    // The HMAC is bound to that timestamp.
    expect(() => Webhook.verify(body, signature, String(at + 1), 'whsec_abc')).toThrow('Signature verification failed');
    // And it ages from that timestamp, not from when sign() ran.
    vi.setSystemTime(new Date((at + 301) * 1000));
    expect(() => Webhook.verify(body, signature, timestamp, 'whsec_abc')).toThrow('Timestamp too old: 301s ago (max: 300s)');
  });

  it('sign() then verify() round-trips a string body at the current time', () => {
    const body = '{"event":"test.ping","event_id":"evt_x","timestamp":"t","api_version":"2025-01","message":"hi"}';
    const { signature, timestamp } = Webhook.sign(body, 'whsec_abc');
    expect(timestamp).toBe(String(SIGNED_AT + 30));
    expect(Webhook.verify(body, signature, timestamp, 'whsec_abc').event).toBe('test.ping');
  });
});
