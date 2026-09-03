/**
 * The User-Agent must equal nope-node/<package.json version>.
 * package.json is the single source of the version string.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { NopeClient } from '../../src/client.js';
import { SDK_VERSION, USER_AGENT } from '../../src/version.js';
import { FakeFetch, json } from './helpers/fake-fetch.js';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

describe('SDK version', () => {
  it('SDK_VERSION equals package.json version', () => {
    expect(SDK_VERSION).toBe(pkg.version);
    expect(USER_AGENT).toBe(`nope-node/${pkg.version}`);
  });

  it('sends User-Agent: nope-node/<package version> on POST and GET', async () => {
    const ff = new FakeFetch(
      json(200, { countries: [], count: 0 }),
      json(200, {
        risks: [],
        rationale: 'ok',
        speaker_severity: 'none',
        speaker_imminence: 'not_applicable',
        show_resources: false,
        request_id: 'r',
        timestamp: 't',
      })
    );
    const client = new NopeClient({ apiKey: 'k', fetch: ff.fetch });
    await client.signpostCountries();
    await client.evaluate({ messages: [{ role: 'user', content: 'hi' }] });

    expect(ff.requests.map((r) => r.headers['user-agent'])).toEqual([
      `nope-node/${pkg.version}`,
      `nope-node/${pkg.version}`,
    ]);
  });
});
