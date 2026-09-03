/**
 * screen() (deprecated, kept): POST /v0/screen, config passthrough,
 * one-time deprecation warning, refused in demo mode.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { NopeClient } from '../../src/client.js';
import { _resetDeprecationWarningsForTests } from '../../src/deprecation.js';
import { FakeFetch, json } from './helpers/fake-fetch.js';

const SCREEN_OK = {
  risks: [{ type: 'suicide', subject: 'self', severity: 'moderate', imminence: 'subacute', confidence: 0.8 }],
  show_resources: true,
  suicidal_ideation: true,
  self_harm: false,
  rationale: 'Passive ideation',
  resources: {
    primary: { type: 'crisis_line', name: '988 Suicide & Crisis Lifeline', phone: '988' },
    secondary: [{ type: 'text_line', name: 'Crisis Text Line', sms_number: '741741' }],
  },
  request_id: 'scr_1',
  timestamp: '2026-09-03T00:55:00.000Z',
  debug: { model: 'm', latency_ms: 1000 },
};

describe('screen()', () => {
  beforeEach(() => {
    _resetDeprecationWarningsForTests();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs to /v0/screen with the config passed through unchanged', async () => {
    const ff = new FakeFetch(json(200, SCREEN_OK));
    const client = new NopeClient({ apiKey: 'k', fetch: ff.fetch });
    const result = await client.screen({
      messages: [{ role: 'user', content: 'dark thoughts' }],
      config: { country: 'US', debug: true, include_recommended_reply: false },
    });
    expect(ff.last.url).toBe('https://api.nope.net/v0/screen');
    expect(ff.last.json).toEqual({
      messages: [{ role: 'user', content: 'dark thoughts' }],
      config: { country: 'US', debug: true, include_recommended_reply: false },
    });
    expect(result.suicidal_ideation).toBe(true);
    expect(result.resources?.primary.phone).toBe('988');
    expect(result.resources?.secondary[0].sms_number).toBe('741741');
    expect(result.debug?.latency_ms).toBe(1000);
    expect(result.risks[0].confidence).toBe(0.8);
  });

  it('warns once per process, not on every call', async () => {
    const ff = new FakeFetch(json(200, SCREEN_OK), json(200, SCREEN_OK));
    const client = new NopeClient({ apiKey: 'k', fetch: ff.fetch });
    await client.screen({ text: 'a' });
    await client.screen({ text: 'b' });
    const warn = vi.mocked(console.warn);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/screen\(\) is deprecated/);
  });

  it('is not available in demo mode', async () => {
    const ff = new FakeFetch();
    const client = new NopeClient({ demo: true, fetch: ff.fetch });
    await expect(client.screen({ text: 'a' })).rejects.toThrow('not available in demo mode');
    expect(ff.requests).toHaveLength(0);
  });

  it('applies the same client-side message validation as evaluate()', async () => {
    const ff = new FakeFetch();
    const client = new NopeClient({ apiKey: 'k', fetch: ff.fetch });
    await expect(client.screen({ messages: [] })).rejects.toThrow("'messages' cannot be empty");
    expect(ff.requests).toHaveLength(0);
  });
});
