/**
 * The User-Agent must equal nope-node/<package.json version>.
 * package.json is the single source of the version string.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { NopeClient } from '../../src/client.js';
import { SDK_VERSION, USER_AGENT } from '../../src/version.js';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

describe('SDK version', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('SDK_VERSION equals package.json version', () => {
    expect(SDK_VERSION).toBe(pkg.version);
    expect(USER_AGENT).toBe(`nope-node/${pkg.version}`);
  });

  it('sends User-Agent: nope-node/<package version> on POST and GET', async () => {
    const seen: string[] = [];
    const fetchFake = vi.fn(async (_url: string, init?: RequestInit) => {
      seen.push((init?.headers as Record<string, string>)['User-Agent']);
      return new Response('{"countries":[],"count":0}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchFake);

    const client = new NopeClient({ apiKey: 'k' });
    await client.signpostCountries();
    await client.evaluate({ messages: [{ role: 'user', content: 'hi' }] });

    expect(seen).toEqual([`nope-node/${pkg.version}`, `nope-node/${pkg.version}`]);
  });
});
