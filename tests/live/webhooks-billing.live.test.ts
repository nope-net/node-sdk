/**
 * Live rows 25-27: webhook management and billing. Row 25 (sign/verify) is
 * offline and lives in tests/unit/webhook.test.ts; row 26 needs an inbound
 * URL and is skipped here.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { NopeFeatureError, Webhook } from '../../src/index.js';
import { authClient, setCurrentFile } from './helpers.js';

describe.sequential('webhooks and billing (live)', () => {
  beforeAll(() => setCurrentFile('webhooks-billing.live.test.ts'));

  it('row 25: Webhook.sign then verify round-trips (offline; full coverage in tests/unit/webhook.test.ts)', () => {
    const body = JSON.stringify({ event: 'test.ping', event_id: 'evt_live', timestamp: new Date().toISOString(), api_version: '2025-01', message: 'hi' });
    const { signature, timestamp } = Webhook.sign(body, 'whsec_live');
    expect(Webhook.verify(body, signature, timestamp, 'whsec_live').event).toBe('test.ping');
  });

  it.skip('row 26: real test.ping delivery (skipped: needs an inbound URL reachable from api.nope.net)', () => {});

  it('row 27a: webhooks.* -> create, list, get, update, test, events, regenerateSecret, delete', async () => {
    const client = authClient();
    let created;
    try {
      created = await client.webhooks.create({ url: 'https://example.com/hooks/nope-sdk-live', min_risk_level: 'high' });
    } catch (e) {
      if (e instanceof NopeFeatureError && e.feature === 'paid_plan') {
        console.warn('[live] webhooks.create needs a paid plan on this account; row 27a shape-checked the 403 only');
        expect(e.upgradeUrl).toMatch(/^https:/);
        return;
      }
      throw e;
    }
    try {
      expect(created.secret).toMatch(/^whsec_/);
      const list = await client.webhooks.list();
      expect(list.webhooks.some((w) => w.id === created.id)).toBe(true);
      const got = await client.webhooks.get(created.id);
      expect(got.secret).toBeUndefined();
      const updated = await client.webhooks.update(created.id, { enabled: false });
      expect(updated.enabled).toBe(false);
      const ping = await client.webhooks.test(created.id);
      expect(typeof ping.success).toBe('boolean');
      expect(typeof ping.duration_ms).toBe('number');
      const events = await client.webhooks.events(created.id, { limit: 5 });
      expect(Array.isArray(events.events)).toBe(true);
      const rotated = await client.webhooks.regenerateSecret(created.id);
      expect(rotated.secret).toMatch(/^whsec_/);
      expect(rotated.secret).not.toBe(created.secret);
    } finally {
      const deleted = await client.webhooks.delete(created.id);
      expect(deleted.success).toBe(true);
    }
  });

  it('row 27b (shape): billing.balance / usage / usageHistory / pricing', async () => {
    const client = authClient();
    const balance = await client.billing.balance();
    expect(typeof balance.balance_mills).toBe('number');
    expect(typeof balance.balance_formatted).toBe('string');
    expect(Array.isArray(balance.topup_options)).toBe(true);

    const usage = await client.billing.usage();
    expect(typeof usage.total_spend_mills).toBe('number');
    expect(Array.isArray(usage.breakdown)).toBe(true);

    const history = await client.billing.usageHistory({ limit: 5 });
    expect(Array.isArray(history.records)).toBe(true);
    expect(history.limit).toBe(5);

    const pricing = await client.billing.pricing();
    expect(pricing.unit).toBe('mills');
    expect(typeof pricing.pricing.evaluate.cost_display).toBe('string');
  });

  it.skip('row 27b (behaviour): balance.estimated_screens, topup_options[].screens and the full pricing table are numbers (pending API deploy of A-5)', async () => {
    const client = authClient();
    const balance = await client.billing.balance();
    expect(typeof balance.estimated_screens).toBe('number');
    expect(typeof balance.topup_options[0].screens).toBe('number');
    const pricing = await client.billing.pricing();
    expect(typeof pricing.pricing.screen.cost_mills).toBe('number');
    expect(typeof pricing.pricing.ocular.cost_mills).toBe('number');
  });

  it.skip('row 27c: billing.topup (skipped: creates a Stripe Checkout session)', () => {});
});
