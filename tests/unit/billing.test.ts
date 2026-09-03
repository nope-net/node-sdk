/**
 * client.billing.*: balance, usage, usageHistory, pricing, topup.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { NopeClient } from '../../src/client.js';
import { NopeAuthError, NopeValidationError } from '../../src/errors.js';
import { FakeFetch, json } from './helpers/fake-fetch.js';

const read = (rel: string) => JSON.parse(readFileSync(new URL(`../fixtures/${rel}`, import.meta.url), 'utf8')) as unknown;
const BALANCE = read('billing/balance.json');
const USAGE = read('billing/usage.json');
const PRICING = read('billing/pricing.json');

const params = (url: string) => Object.fromEntries(new URL(url).searchParams.entries());
const make = (ff: FakeFetch) => new NopeClient({ apiKey: 'k', fetch: ff.fetch, maxRetries: 0 });

describe('client.billing', () => {
  it('balance GETs /v1/billing/balance', async () => {
    const ff = new FakeFetch(json(200, BALANCE));
    const result = await make(ff).billing.balance();
    expect(ff.last.url).toBe('https://api.nope.net/v1/billing/balance');
    expect(ff.last.headers.authorization).toBe('Bearer k');
    expect(result.balance_mills).toBe(12345.6);
    expect(result.low_balance).toBe(false);
    expect(result.topup_options[0].amount_mills).toBe(10000);
  });

  it('usage GETs /v1/billing/usage with optional dates', async () => {
    const ff = new FakeFetch(json(200, USAGE), json(200, USAGE));
    const client = make(ff);
    const result = await client.billing.usage();
    expect(ff.last.url).toBe('https://api.nope.net/v1/billing/usage');
    expect(result.total_spend_mills).toBe(123);
    expect(result.breakdown[0].endpoint).toBe('oversight_analyze');

    await client.billing.usage({ start_date: '2026-09-01', end_date: '2026-09-03' });
    expect(params(ff.last.url)).toEqual({ start_date: '2026-09-01', end_date: '2026-09-03' });
  });

  it('usageHistory GETs /v1/billing/usage/history with paging and filters', async () => {
    const ff = new FakeFetch(
      json(200, {
        records: [{ id: 'u1', endpoint: '/v1/evaluate', cost_mills: 3, cost_formatted: '$0.003', metadata: { request_id: 'r' }, created_at: '2026-09-03T00:55:00.000Z' }],
        total: 1,
        limit: 25,
        offset: 0,
      })
    );
    const result = await make(ff).billing.usageHistory({ limit: 25, offset: 0, endpoint: '/v1/evaluate', start_date: '2026-09-01' });
    expect(ff.last.url.startsWith('https://api.nope.net/v1/billing/usage/history?')).toBe(true);
    expect(params(ff.last.url)).toEqual({ limit: '25', offset: '0', endpoint: '/v1/evaluate', start_date: '2026-09-01' });
    expect(result.records[0].cost_mills).toBe(3);
    expect(result.total).toBe(1);
  });

  it('pricing GETs /v1/billing/pricing without a key', async () => {
    const ff = new FakeFetch(json(200, PRICING));
    const client = new NopeClient({ fetch: ff.fetch });
    const result = await client.billing.pricing();
    expect(ff.last.url).toBe('https://api.nope.net/v1/billing/pricing');
    expect(ff.last.headers.authorization).toBeUndefined();
    expect(result.unit).toBe('mills');
    expect(result.pricing.resources_smart.cost_mills).toBe(1);
    expect(result.free_credit_mills).toBe(1000);
  });

  it('topup POSTs /v1/billing/topup and returns the checkout url', async () => {
    const ff = new FakeFetch(json(200, { checkout_url: 'https://checkout.stripe.com/c/pay/cs_test' }));
    const result = await make(ff).billing.topup({ amount_mills: 10000, success_url: 'https://example.com/ok' });
    expect(ff.last.method).toBe('POST');
    expect(ff.last.url).toBe('https://api.nope.net/v1/billing/topup');
    expect(ff.last.json).toEqual({ amount_mills: 10000, success_url: 'https://example.com/ok' });
    expect(result.checkout_url).toMatch(/^https:\/\/checkout\.stripe\.com/);
  });

  it('maps the topup 400 with valid_options into NopeValidationError.details', async () => {
    const ff = new FakeFetch(
      json(400, {
        error: 'Invalid amount_mills',
        message: 'Amount must be one of the valid top-up options',
        valid_options: [{ amount_mills: 10000, label: '$10' }],
      })
    );
    const err = await make(ff).billing.topup({ amount_mills: 123 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NopeValidationError);
    expect((err as NopeValidationError).details).toEqual({ valid_options: [{ amount_mills: 10000, label: '$10' }] });
    expect((err as NopeValidationError).message).toBe('Amount must be one of the valid top-up options');
  });

  it('balance without a key raises NopeAuthError', async () => {
    const ff = new FakeFetch(json(401, { error: 'Authentication required' }));
    await expect(new NopeClient({ fetch: ff.fetch }).billing.balance()).rejects.toBeInstanceOf(NopeAuthError);
  });

  it('pricing is public, so a demo client can read it; the key-gated calls still refuse', async () => {
    const ff = new FakeFetch(json(200, PRICING));
    const client = new NopeClient({ demo: true, fetch: ff.fetch });
    const result = await client.billing.pricing();
    expect(ff.last.url).toBe('https://api.nope.net/v1/billing/pricing');
    expect(ff.last.headers.authorization).toBeUndefined();
    expect(result.unit).toBe('mills');
    await expect(client.billing.balance()).rejects.toThrow('not available in demo mode');
    expect(ff.requests).toHaveLength(1);
  });
});
