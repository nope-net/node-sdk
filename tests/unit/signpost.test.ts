/**
 * Signpost methods: query serialisation (top-level and config filters),
 * demo routing and refusals, detectCountry hint, deprecated resources*
 * warnings.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NopeClient } from '../../src/client.js';
import { _resetDeprecationWarningsForTests } from '../../src/deprecation.js';
import { FakeFetch, json } from './helpers/fake-fetch.js';

const read = (rel: string) => JSON.parse(readFileSync(new URL(`../fixtures/${rel}`, import.meta.url), 'utf8')) as unknown;
const GB = read('signpost/auth.gb.json');
const SMART = read('signpost/try.smart.json');
const SEARCH = read('signpost/search.auth.json');
const COUNTRIES = read('signpost/countries.json');
const DETECT_MISS = read('signpost/detect-country.miss.json');

const params = (url: string) => Object.fromEntries(new URL(url).searchParams.entries());

describe('signpost()', () => {
  it('GETs /v1/signpost with comma-joined filters from config', async () => {
    const ff = new FakeFetch(json(200, GB));
    const client = new NopeClient({ apiKey: 'k', fetch: ff.fetch });
    const result = await client.signpost({
      country: 'gb',
      config: { scopes: ['suicide', 'domestic_violence'], populations: ['youth'], subdivisions: ['GB-NIR'], limit: 3, urgent: true },
    });
    expect(ff.last.url.startsWith('https://api.nope.net/v1/signpost?')).toBe(true);
    expect(params(ff.last.url)).toEqual({
      country: 'GB',
      scopes: 'suicide,domestic_violence',
      populations: 'youth',
      subdivisions: 'GB-NIR',
      limit: '3',
      urgent: 'true',
    });
    expect(result.count).toBe(3);
    expect(result.resources[1].subdivision_codes).toEqual(['GB-NIR']);
  });

  it('accepts the filters at the top level, and top level wins over config', async () => {
    const ff = new FakeFetch(json(200, GB));
    const client = new NopeClient({ apiKey: 'k', fetch: ff.fetch });
    await client.signpost({
      country: 'GB',
      scopes: ['suicide'],
      urgent: false,
      config: { scopes: ['crisis'], populations: ['men'], urgent: true },
    });
    expect(params(ff.last.url)).toEqual({ country: 'GB', scopes: 'suicide', populations: 'men' });
  });

  it('sends only country when no filters are given', async () => {
    const ff = new FakeFetch(json(200, GB));
    const client = new NopeClient({ apiKey: 'k', fetch: ff.fetch });
    await client.signpost({ country: 'GB' });
    expect(ff.last.url).toBe('https://api.nope.net/v1/signpost?country=GB');
  });

  it('is not available in demo mode', async () => {
    const ff = new FakeFetch();
    const client = new NopeClient({ demo: true, fetch: ff.fetch });
    await expect(client.signpost({ country: 'GB' })).rejects.toThrow('not available in demo mode');
    expect(ff.requests).toHaveLength(0);
  });
});

describe('signpostSmart()', () => {
  it('GETs /v1/signpost/smart with query, scopes, populations and limit', async () => {
    const ff = new FakeFetch(json(200, SMART));
    const client = new NopeClient({ apiKey: 'k', fetch: ff.fetch });
    const result = await client.signpostSmart({
      country: 'us',
      query: 'teen eating disorder',
      config: { scopes: ['eating_disorder'], populations: ['youth'], limit: 5 },
    });
    expect(ff.last.url.startsWith('https://api.nope.net/v1/signpost/smart?')).toBe(true);
    expect(params(ff.last.url)).toEqual({
      country: 'US',
      query: 'teen eating disorder',
      scopes: 'eating_disorder',
      populations: 'youth',
      limit: '5',
    });
    expect(result.ranked[0].rank).toBe(1);
    expect(result.ranked[0].resource.name).toMatch(/ANAD/);
    expect(result.ranked[0].why).toMatch(/eating disorders/);
  });

  it('demo mode routes to /v1/try/signpost/smart and returns try_endpoint', async () => {
    const ff = new FakeFetch(json(200, SMART));
    const client = new NopeClient({ demo: true, fetch: ff.fetch });
    const result = await client.signpostSmart({ country: 'US', query: 'teen eating disorder' });
    expect(ff.last.url).toBe('https://api.nope.net/v1/try/signpost/smart?country=US&query=teen+eating+disorder');
    expect(result.try_endpoint).toBe(true);
    expect(result.message).toBeUndefined();
  });

  it('types the empty-pool message', async () => {
    const ff = new FakeFetch(json(200, { country: 'XK', query: 'q', ranked: [], count: 0, message: 'No resources found for this country' }));
    const client = new NopeClient({ apiKey: 'k', fetch: ff.fetch });
    const result = await client.signpostSmart({ country: 'XK', query: 'q' });
    expect(result.message).toBe('No resources found for this country');
    expect(result.ranked).toEqual([]);
  });
});

describe('signpostSearch()', () => {
  it('parses the explicit search result shape with nulls', async () => {
    const ff = new FakeFetch(json(200, SEARCH));
    const client = new NopeClient({ apiKey: 'k', fetch: ff.fetch });
    const result = await client.signpostSearch({ query: 'lgbtq youth support', country: 'GB' });
    const hit = result.results[0];
    expect(hit.id).toBe('80dcd17e-504a-48f3-b28b-40d204eec38d');
    expect(hit.name_local).toBeNull();
    expect(hit.subdivision_code).toBeNull();
    expect(hit.service_scopes).toContain('lgbtq');
    expect(hit.contacts[0].type).toBe('phone');
    expect(hit.phone).toBe('0345 3 30 30 30');
    expect(hit.type).toBe('support_service');
    expect(hit.open_status.next_change).toBe('2026-09-03T16:00:00.000Z');
    expect(hit.similarity).toBeCloseTo(0.56, 2);
    expect(result.timing.total_ms).toBe(150);
  });

  it('is not available in demo mode', async () => {
    const ff = new FakeFetch();
    const client = new NopeClient({ demo: true, fetch: ff.fetch });
    await expect(client.signpostSearch({ query: 'x' })).rejects.toThrow('not available in demo mode');
    expect(ff.requests).toHaveLength(0);
  });
});

describe('signpostById(), signpostCountries()', () => {
  it('GET /v1/signpost/:id', async () => {
    const ff = new FakeFetch(json(200, { resource: { type: 'crisis_line', name: 'Samaritans', phone: '116 123' } }));
    const client = new NopeClient({ fetch: ff.fetch });
    const result = await client.signpostById('80dcd17e-504a-48f3-b28b-40d204eec38d');
    expect(ff.last.url).toBe('https://api.nope.net/v1/signpost/80dcd17e-504a-48f3-b28b-40d204eec38d');
    expect(result.resource.name).toBe('Samaritans');
  });

  it('GET /v1/signpost/countries works without a key and in demo mode', async () => {
    const ff = new FakeFetch(json(200, COUNTRIES));
    const client = new NopeClient({ demo: true, fetch: ff.fetch });
    const result = await client.signpostCountries();
    expect(ff.last.url).toBe('https://api.nope.net/v1/signpost/countries');
    expect(result.count).toBe(224);
    expect(result.countries).toContain('US');
  });
});

describe('detectCountry()', () => {
  it('returns the miss shape with detected: false', async () => {
    const ff = new FakeFetch(json(200, DETECT_MISS));
    const client = new NopeClient({ fetch: ff.fetch });
    const result = await client.detectCountry();
    expect(ff.last.url).toBe('https://api.nope.net/v1/signpost/detect-country');
    expect(ff.last.headers['x-country']).toBeUndefined();
    expect(result).toEqual({
      country_code: '',
      country_name: '',
      error: 'Could not detect country from headers',
      detected: false,
    });
  });

  it('sends x-country when a countryHint is given and reports detected: true', async () => {
    const ff = new FakeFetch(json(200, { country_code: 'GB', country_name: 'United Kingdom', subdivision_code: 'GB-SCT', subdivision_name: 'Scotland' }));
    const client = new NopeClient({ fetch: ff.fetch });
    const result = await client.detectCountry({ countryHint: 'gb' });
    expect(ff.last.headers['x-country']).toBe('GB');
    expect(result.detected).toBe(true);
    expect(result.subdivision_code).toBe('GB-SCT');
    expect(result.subdivision_name).toBe('Scotland');
  });
});

describe('deprecated resources*()', () => {
  beforeEach(() => {
    _resetDeprecationWarningsForTests();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hit the /v1/resources twins and warn once with the sunset date', async () => {
    const ff = new FakeFetch(json(200, GB), json(200, SMART), json(200, { resource: { type: 'crisis_line', name: 'x' } }), json(200, COUNTRIES), json(200, GB));
    const client = new NopeClient({ apiKey: 'k', fetch: ff.fetch });
    await client.resources({ country: 'GB', config: { scopes: ['suicide'] } });
    expect(ff.last.url).toBe('https://api.nope.net/v1/resources?country=GB&scopes=suicide');
    await client.resourcesSmart({ country: 'US', query: 'q' });
    expect(ff.last.url).toBe('https://api.nope.net/v1/resources/smart?country=US&query=q');
    await client.resourceById('abc');
    expect(ff.last.url).toBe('https://api.nope.net/v1/resources/abc');
    await client.resourcesCountries();
    expect(ff.last.url).toBe('https://api.nope.net/v1/resources/countries');
    await client.resources({ country: 'GB' });

    const warn = vi.mocked(console.warn);
    const messages = warn.mock.calls.map((c) => String(c[0]));
    expect(messages).toHaveLength(4);
    for (const m of messages) {
      expect(m).toMatch(/deprecated/);
      expect(m).toMatch(/sunset 2027-01-01; use signpost/);
    }
  });

  it('resourcesSmart routes to /v1/try/resources/smart in demo mode', async () => {
    const ff = new FakeFetch(json(200, SMART));
    const client = new NopeClient({ demo: true, fetch: ff.fetch });
    await client.resourcesSmart({ country: 'US', query: 'q' });
    expect(ff.last.url).toBe('https://api.nope.net/v1/try/resources/smart?country=US&query=q');
  });
});
