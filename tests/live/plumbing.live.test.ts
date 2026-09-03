/**
 * Live row 28: client plumbing against a public route.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll } from 'vitest';
import { NopeConnectionError } from '../../src/index.js';
import { API_URL } from './env.js';
import { publicClient, recordingFetch, setCurrentFile, type Recorded } from './helpers.js';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };

describe.sequential('plumbing (live)', () => {
  beforeAll(() => setCurrentFile('plumbing.live.test.ts'));

  it('row 28: timeout: 1 -> NopeConnectionError', async () => {
    const client = publicClient({ timeout: 1, maxRetries: 0 });
    const err = await client.signpostCountries().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NopeConnectionError);
    expect((err as NopeConnectionError).message).toMatch(/timed out/);
  });

  it('row 28: trailing-slash baseUrl works', async () => {
    const client = publicClient({ baseUrl: `${API_URL}/` });
    const result = await client.signpostCountries();
    expect(result.count).toBeGreaterThan(0);
  });

  it('row 28: User-Agent equals nope-node/<package version>; rate-limit meta populated', async () => {
    const log: Recorded[] = [];
    const client = publicClient({ fetch: recordingFetch(log) });
    await client.signpostCountries();
    expect(log[0].requestHeaders['User-Agent']).toBe(`nope-node/${pkg.version}`);
    expect(log[0].status).toBe(200);
    expect(client.lastResponseMeta?.status).toBe(200);
  });

  it.skip('row 28: 402 path via a drained account (optional; needs an admin-funded zero balance)', () => {});
});
