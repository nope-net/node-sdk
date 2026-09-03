/**
 * evaluate(): request serialisation, demo routing (with the user_country
 * mirror the try route still reads), and client-side validation.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { NopeClient } from '../../src/client.js';
import { FakeFetch, json } from './helpers/fake-fetch.js';

const read = (rel: string) => JSON.parse(readFileSync(new URL(`../fixtures/${rel}`, import.meta.url), 'utf8')) as unknown;
const BENIGN = read('evaluate/auth.benign.json');
const TRY_GB = read('evaluate/try.gb.json');

describe('evaluate()', () => {
  it('sends only the four config keys the v1 route reads', async () => {
    const ff = new FakeFetch(json(200, BENIGN));
    const client = new NopeClient({ apiKey: 'k', fetch: ff.fetch });
    await client.evaluate({
      messages: [{ role: 'user', content: 'hello' }],
      config: { country: 'GB', include_resources: false, conversation_id: 'c1', end_user_id: 'u1' },
    });
    expect(ff.last.url).toBe('https://api.nope.net/v1/evaluate');
    expect(ff.last.json).toEqual({
      messages: [{ role: 'user', content: 'hello' }],
      config: { country: 'GB', include_resources: false, conversation_id: 'c1', end_user_id: 'u1' },
    });
  });

  it('does not send user_country on the authenticated route', async () => {
    const ff = new FakeFetch(json(200, BENIGN));
    const client = new NopeClient({ apiKey: 'k', fetch: ff.fetch });
    await client.evaluate({ text: 'hello', config: { country: 'GB' } });
    expect((ff.last.json as { config: Record<string, unknown> }).config).toEqual({ country: 'GB' });
  });

  it('demo mode routes to /v1/try/evaluate and mirrors country into config.user_country', async () => {
    const ff = new FakeFetch(json(200, TRY_GB));
    const client = new NopeClient({ demo: true, fetch: ff.fetch });
    const result = await client.evaluate({
      messages: [{ role: 'user', content: 'hello' }],
      config: { country: 'GB' },
    });
    expect(ff.last.url).toBe('https://api.nope.net/v1/try/evaluate');
    expect(ff.last.headers.authorization).toBeUndefined();
    expect((ff.last.json as { config: Record<string, unknown> }).config).toEqual({
      country: 'GB',
      user_country: 'GB',
    });
    expect(result.metadata?.try_endpoint).toBe(true);
    expect(result.metadata?.model).toBe('nope-edge:minime-v14f');
    expect(result.resources?.primary.name).toBe('Samaritans');
    expect(result.resources?.secondary[0].subdivision_codes).toEqual(['GB-NIR']);
  });

  it('demo mode without a country sends no user_country', async () => {
    const ff = new FakeFetch(json(200, TRY_GB));
    const client = new NopeClient({ demo: true, fetch: ff.fetch });
    await client.evaluate({ text: 'hello' });
    expect(ff.last.json).toEqual({ text: 'hello', config: {} });
  });

  it('parses the typed response: risks, features, required top-level fields', async () => {
    const ff = new FakeFetch(json(200, TRY_GB));
    const client = new NopeClient({ apiKey: 'k', fetch: ff.fetch });
    const result = await client.evaluate({ text: 'hello' });
    expect(result.risks[0].type).toBe('suicide');
    expect(result.risks[0].subject).toBe('self');
    expect(result.risks[0].features).toContain('passive_ideation');
    expect(result.speaker_severity).toBe('moderate');
    expect(result.speaker_imminence).toBe('subacute');
    expect(result.show_resources).toBe(true);
    expect(typeof result.rationale).toBe('string');
  });

  describe('client-side validation (no request is sent)', () => {
    const client = (ff: FakeFetch) => new NopeClient({ apiKey: 'k', fetch: ff.fetch });

    it('rejects an empty messages array', async () => {
      const ff = new FakeFetch();
      await expect(client(ff).evaluate({ messages: [] })).rejects.toThrow("'messages' cannot be empty");
      expect(ff.requests).toHaveLength(0);
    });

    it('rejects more than 100 messages', async () => {
      const ff = new FakeFetch();
      const messages = Array.from({ length: 101 }, () => ({ role: 'user' as const, content: 'x' }));
      await expect(client(ff).evaluate({ messages })).rejects.toThrow('at most 100 messages');
      expect(ff.requests).toHaveLength(0);
    });

    it('rejects a role other than user or assistant', async () => {
      const ff = new FakeFetch();
      const messages = [{ role: 'system', content: 'x' }] as unknown as { role: 'user'; content: string }[];
      await expect(client(ff).evaluate({ messages })).rejects.toThrow('role must be "user" or "assistant"');
      expect(ff.requests).toHaveLength(0);
    });

    it('rejects an empty text', async () => {
      const ff = new FakeFetch();
      await expect(client(ff).evaluate({ text: '   ' })).rejects.toThrow("'text' cannot be empty");
      expect(ff.requests).toHaveLength(0);
    });
  });
});
