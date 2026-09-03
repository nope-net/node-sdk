/**
 * client.lastResponseMeta: rate-limit and balance headers from the last
 * response, built from tests/fixtures/headers/*.txt.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { NopeClient } from '../../src/client.js';
import { FakeFetch, headersFromDump, json } from './helpers/fake-fetch.js';
import * as derived from './fixtures-derived/error-bodies.js';

const read = (rel: string) => readFileSync(new URL(`../fixtures/${rel}`, import.meta.url), 'utf8');
const evaluateBody = JSON.parse(read('evaluate/auth.benign.json')) as unknown;

describe('lastResponseMeta', () => {
  it('is undefined before any call', () => {
    const client = new NopeClient({ apiKey: 'k', fetch: new FakeFetch().fetch });
    expect(client.lastResponseMeta).toBeUndefined();
  });

  it('exposes rate limit and balance from a paid authenticated response', async () => {
    const ff = new FakeFetch(json(200, evaluateBody, headersFromDump(read('headers/evaluate.auth.txt'))));
    const client = new NopeClient({ apiKey: 'k', fetch: ff.fetch });
    await client.evaluate({ messages: [{ role: 'user', content: 'hello' }] });
    expect(client.lastResponseMeta).toEqual({
      status: 200,
      rateLimit: { limit: 2000, remaining: 1999, reset: 1788396960000 },
      balance: { balanceMills: 12345.6, costMills: 3 },
    });
  });

  it('leaves balance undefined on a demo (unbilled) response', async () => {
    const ff = new FakeFetch(json(200, evaluateBody, headersFromDump(read('headers/evaluate.try.txt'))));
    const client = new NopeClient({ demo: true, fetch: ff.fetch });
    await client.evaluate({ messages: [{ role: 'user', content: 'hello' }] });
    expect(client.lastResponseMeta).toEqual({
      status: 200,
      rateLimit: { limit: 10, remaining: 9, reset: 1788396960000 },
      balance: undefined,
    });
  });

  it('leaves both undefined when the headers are absent (413 before the limiter)', async () => {
    const ff = new FakeFetch(json(413, { error: 'Payload too large', max_bytes: 524288 }, headersFromDump(read('headers/413.txt'))));
    const client = new NopeClient({ apiKey: 'k', fetch: ff.fetch, maxRetries: 0 });
    await expect(client.signpostCountries()).rejects.toThrow();
    expect(client.lastResponseMeta).toEqual({ status: 413, rateLimit: undefined, balance: undefined });
  });

  it('is updated by error responses too (429 carries the rate-limit headers)', async () => {
    const ff = new FakeFetch(json(429, derived.RATE_LIMITED.body, derived.RATE_LIMITED.headers));
    const client = new NopeClient({ apiKey: 'k', fetch: ff.fetch, maxRetries: 0 });
    await expect(client.signpostCountries()).rejects.toThrow();
    expect(client.lastResponseMeta?.status).toBe(429);
    expect(client.lastResponseMeta?.rateLimit).toEqual({ limit: 100, remaining: 0, reset: 1788396967000 });
  });
});
