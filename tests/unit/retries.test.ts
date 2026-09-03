/**
 * Retry policy: 429 and 503 only, up to maxRetries, Retry-After seconds
 * (header, else body retry_after_seconds, else 1 s exponential), capped at
 * 30 s per wait, never on timeouts, connection errors or other 5xx.
 */

import { describe, it, expect, vi } from 'vitest';
import { NopeClient } from '../../src/client.js';
import {
  NopeConnectionError,
  NopeRateLimitError,
  NopeServerError,
  NopeServiceUnavailableError,
} from '../../src/errors.js';
import { FakeFetch, abortingFetch, json } from './helpers/fake-fetch.js';
import * as derived from './fixtures-derived/error-bodies.js';

const OK = () => json(200, { countries: ['US'], count: 1 });
const RATE_LIMITED = () => json(429, derived.RATE_LIMITED.body, derived.RATE_LIMITED.headers);
const DEP_503 = () => json(503, derived.DEPENDENCY_UNAVAILABLE.body, derived.DEPENDENCY_UNAVAILABLE.headers);

function make(ff: FakeFetch, options: { maxRetries?: number; timeout?: number } = {}) {
  const sleep = vi.fn(async (_ms: number) => {});
  const client = new NopeClient({ apiKey: 'k', fetch: ff.fetch, sleep, ...options });
  return { client, sleep };
}

describe('retries', () => {
  it('retries a 429 once and returns the eventual 200; waits Retry-After seconds', async () => {
    const ff = new FakeFetch(RATE_LIMITED(), OK());
    const { client, sleep } = make(ff);
    const result = await client.signpostCountries();
    expect(result.count).toBe(1);
    expect(ff.requests).toHaveLength(2);
    expect(sleep.mock.calls).toEqual([[7000]]);
  });

  it('retries 503 up to maxRetries (default 2)', async () => {
    const ff = new FakeFetch(DEP_503(), DEP_503(), OK());
    const { client, sleep } = make(ff);
    await client.signpostCountries();
    expect(ff.requests).toHaveLength(3);
    expect(sleep.mock.calls).toEqual([[5000], [5000]]);
  });

  it('throws the last error once maxRetries is exhausted', async () => {
    const ff = new FakeFetch(RATE_LIMITED(), RATE_LIMITED(), RATE_LIMITED());
    const { client, sleep } = make(ff);
    await expect(client.signpostCountries()).rejects.toBeInstanceOf(NopeRateLimitError);
    expect(ff.requests).toHaveLength(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('maxRetries: 0 disables retries', async () => {
    const ff = new FakeFetch(DEP_503(), OK());
    const { client, sleep } = make(ff, { maxRetries: 0 });
    await expect(client.signpostCountries()).rejects.toBeInstanceOf(NopeServiceUnavailableError);
    expect(ff.requests).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('falls back to 1 s exponential backoff when no Retry-After hint exists', async () => {
    const ff = new FakeFetch(
      json(503, { error: 'Temporarily unavailable' }),
      json(503, { error: 'Temporarily unavailable' }),
      OK()
    );
    const { client, sleep } = make(ff);
    await client.signpostCountries();
    expect(sleep.mock.calls).toEqual([[1000], [2000]]);
  });

  it('uses body retry_after_seconds when the header is absent', async () => {
    const ff = new FakeFetch(json(429, derived.RATE_LIMITED.body), OK());
    const { client, sleep } = make(ff);
    await client.signpostCountries();
    expect(sleep.mock.calls).toEqual([[7000]]);
  });

  it('caps each wait at 30 s', async () => {
    const ff = new FakeFetch(json(429, { error: 'rate_limit_exceeded' }, { 'Retry-After': '120' }), OK());
    const { client, sleep } = make(ff);
    await client.signpostCountries();
    expect(sleep.mock.calls).toEqual([[30000]]);
  });

  it('never retries a 500', async () => {
    const ff = new FakeFetch(json(500, derived.INTERNAL_ERROR.body), OK());
    const { client, sleep } = make(ff);
    await expect(client.signpostCountries()).rejects.toBeInstanceOf(NopeServerError);
    expect(ff.requests).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('never retries a 502', async () => {
    const ff = new FakeFetch(json(502, { error: 'upstream' }), OK());
    const { client, sleep } = make(ff);
    await expect(client.signpostCountries()).rejects.toBeInstanceOf(NopeServerError);
    expect(ff.requests).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('never retries a connection error', async () => {
    const ff = new FakeFetch(new TypeError('fetch failed'), OK());
    const { client, sleep } = make(ff);
    await expect(client.signpostCountries()).rejects.toBeInstanceOf(NopeConnectionError);
    expect(ff.requests).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('never retries a timeout (the API charges before the handler runs)', async () => {
    const seen: unknown[] = [];
    const sleep = vi.fn(async (_ms: number) => {});
    const client = new NopeClient({ apiKey: 'k', fetch: abortingFetch(seen as never), timeout: 5, sleep });
    await expect(client.signpostCountries()).rejects.toBeInstanceOf(NopeConnectionError);
    expect(seen).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('re-sends the same POST body and headers on retry', async () => {
    const ff = new FakeFetch(RATE_LIMITED(), json(200, {
      risks: [],
      rationale: 'ok',
      speaker_severity: 'none',
      speaker_imminence: 'not_applicable',
      show_resources: false,
      request_id: 'r',
      timestamp: 't',
    }));
    const { client } = make(ff);
    await client.evaluate({ messages: [{ role: 'user', content: 'hi' }], config: { country: 'GB' } });
    expect(ff.requests).toHaveLength(2);
    expect(ff.requests[0].body).toBe(ff.requests[1].body);
    expect(ff.requests[1].headers.authorization).toBe('Bearer k');
    expect(ff.requests[1].method).toBe('POST');
  });
});
