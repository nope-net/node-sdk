/**
 * Live rows 17-24: signpost family, public routes, deprecated twins.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NopeNotFoundError } from '../../src/index.js';
import { _resetDeprecationWarningsForTests } from '../../src/deprecation.js';
import { authClient, demoClient, publicClient, charge, recordingFetch, setCurrentFile, type Recorded } from './helpers.js';

describe.sequential('signpost (live)', () => {
  beforeAll(() => setCurrentFile('signpost.live.test.ts'));

  let searchHitId: string | undefined;
  let searchHitName: string | undefined;

  it('row 17: basic with scopes -> primary/secondary present; subdivisions narrows', async () => {
    const client = authClient();
    const scoped = await client.signpost({ country: 'GB', scopes: ['suicide'], limit: 5 });
    expect(scoped.country).toBe('GB');
    expect(scoped.count).toBe(scoped.resources.length);
    expect(Array.isArray(scoped.primary)).toBe(true);
    expect(Array.isArray(scoped.secondary)).toBe(true);
    expect(scoped.scopes_requested).toEqual(['suicide']);

    const all = await client.signpost({ country: 'GB', limit: 10 });
    const ni = await client.signpost({ country: 'GB', subdivisions: ['GB-NIR'], limit: 10 });
    expect(ni.count).toBeLessThanOrEqual(all.count);
    for (const r of ni.resources) {
      const codes = r.subdivision_codes ?? [];
      expect(codes.length === 0 || codes.includes('GB-NIR')).toBe(true);
    }
  });

  it('row 18: smart auth -> ranked[]{rank, resource, why}, at most 5', async () => {
    const client = authClient();
    const result = await client.signpostSmart({ country: 'US', query: 'teen struggling with an eating disorder' });
    charge(client);
    expect(result.ranked.length).toBeLessThanOrEqual(5);
    expect(result.count).toBe(result.ranked.length);
    for (const pick of result.ranked) {
      expect(typeof pick.rank).toBe('number');
      expect(typeof pick.why).toBe('string');
      expect(typeof pick.resource.name).toBe('string');
    }
    expect(client.lastResponseMeta?.balance?.costMills).toBe(1);
  });

  it('row 19: smart demo -> try_endpoint', async () => {
    const client = demoClient();
    const result = await client.signpostSmart({ country: 'US', query: 'teen struggling with an eating disorder' });
    expect(result.try_endpoint).toBe(true);
    expect(result.ranked.length).toBeLessThanOrEqual(5);
  });

  it('row 20: search -> similarity in [0, 1], timing, nulls tolerated', async () => {
    const client = authClient();
    const result = await client.signpostSearch({ query: 'lgbtq youth support', country: 'GB', limit: 5 });
    expect(result.count).toBe(result.results.length);
    expect(result.results.length).toBeGreaterThan(0);
    expect(typeof result.timing.total_ms).toBe('number');
    for (const hit of result.results) {
      expect(hit.similarity).toBeGreaterThanOrEqual(0);
      expect(hit.similarity).toBeLessThanOrEqual(1);
      expect(typeof hit.id).toBe('string');
      expect(hit.name_local === null || typeof hit.name_local === 'string').toBe(true);
      expect(Array.isArray(hit.contacts)).toBe(true);
    }
    searchHitId = result.results[0].id;
    searchHitName = result.results[0].name;
  });

  it('row 21: signpostById from row 20 -> name matches; random UUID -> NopeNotFoundError', async () => {
    const client = publicClient();
    expect(searchHitId).toBeTruthy();
    const found = await client.signpostById(searchHitId!);
    expect(found.resource.name).toBe(searchHitName);
    const err = await client.signpostById('00000000-0000-4000-8000-000000000000').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NopeNotFoundError);
  });

  it.skip('row 21 (behaviour): signpostById result carries id (pending API deploy of A-6)', async () => {
    const client = publicClient();
    const found = await client.signpostById(searchHitId!);
    expect(found.resource.id).toBe(searchHitId);
  });

  it('row 22: countries -> contains US, count > 200', async () => {
    const result = await publicClient().signpostCountries();
    expect(result.countries).toContain('US');
    expect(result.count).toBeGreaterThan(200);
    expect(result.count).toBe(result.countries.length);
  });

  it('row 23: detectCountry -> miss shape typed; countryHint echoed', async () => {
    const client = publicClient();
    const miss = await client.detectCountry();
    expect(typeof miss.country_code).toBe('string');
    expect(typeof miss.detected).toBe('boolean');
    if (!miss.detected) expect(typeof miss.error).toBe('string');

    const hinted = await client.detectCountry({ countryHint: 'GB' });
    expect(hinted.detected).toBe(true);
    expect(hinted.country_code).toBe('GB');
  });

  it('row 24: resources* twins -> same body as signpost, Deprecation header, warning emitted', async () => {
    _resetDeprecationWarningsForTests();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const log: Recorded[] = [];
      const client = authClient({ fetch: recordingFetch(log) });
      const viaSignpost = await client.signpost({ country: 'GB', limit: 3 });
      const viaResources = await client.resources({ country: 'GB', limit: 3 });
      expect(viaResources.resources.map((r) => r.name)).toEqual(viaSignpost.resources.map((r) => r.name));
      const last = log[log.length - 1];
      expect(last.url).toContain('/v1/resources?');
      expect(last.responseHeaders.get('deprecation')).toBe('true');
      expect(last.responseHeaders.get('sunset')).toMatch(/2027/);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toMatch(/sunset 2027-01-01; use signpost/);
    } finally {
      warn.mockRestore();
    }
  });
});
