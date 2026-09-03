/**
 * client.webhooks.*: management routes, including the 502 test-ping result
 * that is returned rather than raised.
 */

import { describe, it, expect } from 'vitest';
import { NopeClient } from '../../src/client.js';
import { NopeFeatureError, NopeNotFoundError } from '../../src/errors.js';
import { FakeFetch, json } from './helpers/fake-fetch.js';
import * as derived from './fixtures-derived/error-bodies.js';

const WEBHOOK = {
  id: 'wh_1',
  url: 'https://example.com/hooks/nope',
  min_risk_level: 'high',
  enabled: true,
  include_conversation: false,
  created_at: '2026-09-03T00:55:00.000Z',
  updated_at: '2026-09-03T00:55:00.000Z',
};

const EVENT = {
  id: 'evt_00000000000000000000000000000004',
  webhook_id: 'wh_1',
  event_type: 'test.ping',
  payload: {
    event: 'test.ping',
    event_id: 'evt_00000000000000000000000000000004',
    timestamp: '2026-09-03T00:55:00.000Z',
    api_version: '2025-01',
    message: 'Webhook configured successfully',
  },
  status: 'sent',
  http_status: 200,
  attempt_count: 1,
  last_attempt_at: '2026-09-03T00:55:01.000Z',
  created_at: '2026-09-03T00:55:00.000Z',
};

const make = (ff: FakeFetch) => new NopeClient({ apiKey: 'k', fetch: ff.fetch, maxRetries: 0 });

describe('client.webhooks', () => {
  it('create POSTs /v1/webhooks and returns the secret once', async () => {
    const ff = new FakeFetch(json(201, { ...WEBHOOK, secret: 'whsec_' + 'a'.repeat(64) }));
    const result = await make(ff).webhooks.create({ url: WEBHOOK.url, min_risk_level: 'high', include_conversation: false });
    expect(ff.last.method).toBe('POST');
    expect(ff.last.url).toBe('https://api.nope.net/v1/webhooks');
    expect(ff.last.json).toEqual({ url: WEBHOOK.url, min_risk_level: 'high', include_conversation: false });
    expect(result.secret).toMatch(/^whsec_/);
    expect(result.id).toBe('wh_1');
  });

  it('create on a free plan raises NopeFeatureError(paid_plan)', async () => {
    const ff = new FakeFetch(json(403, derived.PAID_PLAN_REQUIRED.body));
    await expect(make(ff).webhooks.create({ url: WEBHOOK.url })).rejects.toBeInstanceOf(NopeFeatureError);
  });

  it('list, get, update, delete, regenerateSecret hit the documented routes', async () => {
    const ff = new FakeFetch(
      json(200, { webhooks: [WEBHOOK] }),
      json(200, WEBHOOK),
      json(200, { ...WEBHOOK, enabled: false }),
      json(200, { success: true }),
      json(200, { secret: 'whsec_' + 'b'.repeat(64) })
    );
    const client = make(ff);

    const list = await client.webhooks.list();
    expect(ff.last.url).toBe('https://api.nope.net/v1/webhooks');
    expect(ff.last.method).toBe('GET');
    expect(list.webhooks[0].id).toBe('wh_1');
    expect(list.webhooks[0].secret).toBeUndefined();

    const got = await client.webhooks.get('wh_1');
    expect(ff.last.url).toBe('https://api.nope.net/v1/webhooks/wh_1');
    expect(got.min_risk_level).toBe('high');

    const updated = await client.webhooks.update('wh_1', { enabled: false });
    expect(ff.last.method).toBe('PUT');
    expect(ff.last.url).toBe('https://api.nope.net/v1/webhooks/wh_1');
    expect(ff.last.json).toEqual({ enabled: false });
    expect(updated.enabled).toBe(false);

    const deleted = await client.webhooks.delete('wh_1');
    expect(ff.last.method).toBe('DELETE');
    expect(ff.last.body).toBeUndefined();
    expect(deleted.success).toBe(true);

    const rotated = await client.webhooks.regenerateSecret('wh_1');
    expect(ff.last.method).toBe('POST');
    expect(ff.last.url).toBe('https://api.nope.net/v1/webhooks/wh_1/regenerate-secret');
    expect(rotated.secret).toMatch(/^whsec_/);
  });

  it('get on an unknown id raises NopeNotFoundError', async () => {
    const ff = new FakeFetch(json(404, { error: 'Webhook not found' }));
    await expect(make(ff).webhooks.get('wh_missing')).rejects.toBeInstanceOf(NopeNotFoundError);
  });

  it('test returns the delivery result on 200', async () => {
    const ff = new FakeFetch(json(200, { success: true, http_status: 200, duration_ms: 120 }));
    const result = await make(ff).webhooks.test('wh_1');
    expect(ff.last.url).toBe('https://api.nope.net/v1/webhooks/wh_1/test');
    expect(result.success).toBe(true);
    expect(result.duration_ms).toBe(120);
  });

  it('test returns the delivery result on 502 instead of raising', async () => {
    const ff = new FakeFetch(json(502, derived.WEBHOOK_TEST_FAILED.body));
    const result = await make(ff).webhooks.test('wh_1');
    expect(result).toEqual(derived.WEBHOOK_TEST_FAILED.body);
    expect(result.success).toBe(false);
    expect(result.error_message).toBe('HTTP 500');
  });

  it('events lists per webhook or for the account, with limit', async () => {
    const ff = new FakeFetch(json(200, { events: [EVENT] }), json(200, { events: [EVENT] }), json(200, { events: [] }));
    const client = make(ff);

    const perHook = await client.webhooks.events('wh_1', { limit: 10 });
    expect(ff.last.url).toBe('https://api.nope.net/v1/webhooks/wh_1/events?limit=10');
    expect(perHook.events[0].event_type).toBe('test.ping');
    expect(perHook.events[0].payload.event).toBe('test.ping');
    expect(perHook.events[0].status).toBe('sent');

    await client.webhooks.events();
    expect(ff.last.url).toBe('https://api.nope.net/v1/webhooks/events');

    await client.webhooks.events(undefined, { limit: 5 });
    expect(ff.last.url).toBe('https://api.nope.net/v1/webhooks/events?limit=5');
  });

  it('is not available in demo mode', async () => {
    const ff = new FakeFetch();
    const client = new NopeClient({ demo: true, fetch: ff.fetch });
    await expect(client.webhooks.list()).rejects.toThrow('not available in demo mode');
    await expect(client.webhooks.create({ url: WEBHOOK.url })).rejects.toThrow('not available in demo mode');
    await expect(client.webhooks.test('wh_1')).rejects.toThrow('not available in demo mode');
    expect(ff.requests).toHaveLength(0);
  });
});
