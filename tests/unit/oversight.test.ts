/**
 * client.oversight.analyze / ingest: request serialisation, client-side
 * filter validation, demo routing, ingest cap.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { NopeClient } from '../../src/client.js';
import type { OversightConversation } from '../../src/index.js';
import { FakeFetch, json } from './helpers/fake-fetch.js';

const read = (rel: string) => JSON.parse(readFileSync(new URL(`../fixtures/${rel}`, import.meta.url), 'utf8')) as unknown;
const AUTH_FAST = read('oversight/auth.fast.json');
const TRY_FULL = read('oversight/try.full.json');
const TRY_FAST = read('oversight/try.fast.json');

const CONVERSATION: OversightConversation = {
  conversation_id: 'conv_1',
  messages: [
    { role: 'user', content: 'nobody at work listens to me' },
    { role: 'assistant', content: "I'm always here and I understand you better than they ever will." },
  ],
  metadata: { platform: 'companion-app', user_is_minor: false },
};

describe('oversight.analyze()', () => {
  it('POSTs the full request shape: conversation, bot_context, config, behaviors', async () => {
    const ff = new FakeFetch(json(200, AUTH_FAST));
    const client = new NopeClient({ apiKey: 'k', fetch: ff.fetch });
    const result = await client.oversight.analyze({
      conversation: CONVERSATION,
      bot_context: 'customer support bot for an airline',
      config: { strategy: 'single', mode: 'fast', include_raw_xml: false, model: 'openrouter:google/gemini-2.5-flash-lite' },
      behaviors: { enabled: ['dependency_reinforcement'], min_severity: 'medium', categories: ['boundary_violations'] },
    });
    expect(ff.last.url).toBe('https://api.nope.net/v1/oversight/analyze');
    expect(ff.last.headers.authorization).toBe('Bearer k');
    expect(ff.last.json).toEqual({
      conversation: CONVERSATION,
      bot_context: 'customer support bot for an airline',
      config: { strategy: 'single', mode: 'fast', include_raw_xml: false, model: 'openrouter:google/gemini-2.5-flash-lite' },
      behaviors: { enabled: ['dependency_reinforcement'], min_severity: 'medium', categories: ['boundary_violations'] },
    });
    expect(result.strategy).toBe('single');
    expect(result.strategy_reason).toMatch(/Auto-selected/);
    expect(result.result.mode_used).toBe('fast');
    expect(result.result.detected_behaviors[0].recommendation).toMatch(/real-world connections/);
    expect(result.result.turn_analysis).toEqual([]);
  });

  it('omits optional keys that were not given', async () => {
    const ff = new FakeFetch(json(200, AUTH_FAST));
    const client = new NopeClient({ apiKey: 'k', fetch: ff.fetch });
    await client.oversight.analyze({ conversation: { messages: CONVERSATION.messages } });
    expect(ff.last.json).toEqual({ conversation: { messages: CONVERSATION.messages } });
  });

  it('demo mode routes to /v1/try/oversight/analyze and returns the demo envelope', async () => {
    const ff = new FakeFetch(json(200, TRY_FULL), json(200, TRY_FAST));
    const client = new NopeClient({ demo: true, fetch: ff.fetch });
    const full = await client.oversight.analyze({ conversation: CONVERSATION });
    expect(ff.last.url).toBe('https://api.nope.net/v1/try/oversight/analyze');
    expect(ff.last.headers.authorization).toBeUndefined();
    expect(full.mode).toBe('single');
    expect(full.try_endpoint).toBe(true);
    expect(full.result.mode_used).toBe('full');
    expect(full.result.summary).toMatch(/escalated/);

    const fast = await client.oversight.analyze({ conversation: CONVERSATION, config: { mode: 'fast' } });
    expect(fast.mode).toBe('fast');
    expect(fast.result.trajectory).toBe('stable');
    expect(fast.result.summary).toBeUndefined();
  });

  describe('client-side validation (no request is sent)', () => {
    const client = (ff: FakeFetch) => new NopeClient({ apiKey: 'k', fetch: ff.fetch });

    it('requires a conversation with non-empty messages', async () => {
      const ff = new FakeFetch();
      await expect(client(ff).oversight.analyze({ conversation: { messages: [] } })).rejects.toThrow('cannot be empty');
      expect(ff.requests).toHaveLength(0);
    });

    it('rejects behaviors.enabled and behaviors.disabled both non-empty', async () => {
      const ff = new FakeFetch();
      await expect(
        client(ff).oversight.analyze({
          conversation: CONVERSATION,
          behaviors: { enabled: ['gaslighting'], disabled: ['barrier_erosion'] },
        })
      ).rejects.toThrow('"behaviors.enabled" and "behaviors.disabled" are mutually exclusive');
      expect(ff.requests).toHaveLength(0);
    });

    it('allows an empty enabled list alongside disabled (matches the API)', async () => {
      const ff = new FakeFetch(json(200, AUTH_FAST));
      await client(ff).oversight.analyze({
        conversation: CONVERSATION,
        behaviors: { enabled: [], disabled: ['barrier_erosion'] },
      });
      expect(ff.requests).toHaveLength(1);
    });

    it('rejects an invalid min_severity', async () => {
      const ff = new FakeFetch();
      await expect(
        client(ff).oversight.analyze({
          conversation: CONVERSATION,
          behaviors: { min_severity: 'severe' as unknown as 'high' },
        })
      ).rejects.toThrow('"behaviors.min_severity" must be one of: low, medium, high, critical');
      expect(ff.requests).toHaveLength(0);
    });
  });
});

describe('oversight.ingest()', () => {
  const conversations = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      conversation_id: `conv_${i}`,
      messages: [{ role: 'user' as const, content: 'hi' }, { role: 'assistant' as const, content: 'hello' }],
    }));

  const INGEST_OK = {
    ingestion_id: 'ing_1',
    status: 'complete',
    conversations_received: 2,
    conversations_processed: 2,
    dashboard_url: 'https://dashboard.nope.net/oversight/conversations?ingestion=ing_1',
    results: [
      { conversation_id: 'conv_0', overall_concern: 'none', behaviors_detected: 0 },
      {
        conversation_id: 'conv_1',
        overall_concern: 'high',
        behaviors_detected: 2,
        truncation_warnings: [{ type: 'message_truncated', details: 'Message 3 truncated from 12000 to 10000 characters' }],
      },
    ],
  };

  it('POSTs conversations, webhook_url and config to /v1/oversight/ingest', async () => {
    const ff = new FakeFetch(json(200, INGEST_OK));
    const client = new NopeClient({ apiKey: 'k', fetch: ff.fetch });
    const result = await client.oversight.ingest({
      conversations: conversations(2),
      webhook_url: 'https://example.com/hooks/nope',
      config: { model: 'openrouter:google/gemini-2.5-flash' },
    });
    expect(ff.last.url).toBe('https://api.nope.net/v1/oversight/ingest');
    expect(ff.last.json).toEqual({
      conversations: conversations(2),
      webhook_url: 'https://example.com/hooks/nope',
      config: { model: 'openrouter:google/gemini-2.5-flash' },
    });
    expect(result.status).toBe('complete');
    expect(result.results?.[1].truncation_warnings?.[0].type).toBe('message_truncated');
    expect(result.results?.[1].truncation_warnings?.[0].details).toMatch(/truncated/);
  });

  it('accepts 300 conversations and rejects 301 client-side', async () => {
    const ff = new FakeFetch(json(200, INGEST_OK));
    const client = new NopeClient({ apiKey: 'k', fetch: ff.fetch });
    await client.oversight.ingest({ conversations: conversations(300) });
    expect(ff.requests).toHaveLength(1);
    await expect(client.oversight.ingest({ conversations: conversations(301) })).rejects.toThrow('Maximum allowed: 300');
    expect(ff.requests).toHaveLength(1);
  });

  it('requires conversation_id and non-empty messages on every conversation', async () => {
    const ff = new FakeFetch();
    const client = new NopeClient({ apiKey: 'k', fetch: ff.fetch });
    await expect(
      client.oversight.ingest({ conversations: [{ conversation_id: '', messages: [{ role: 'user', content: 'x' }] }] })
    ).rejects.toThrow('must have a "conversation_id"');
    await expect(
      client.oversight.ingest({ conversations: [{ conversation_id: 'c', messages: [] }] })
    ).rejects.toThrow('non-empty "messages"');
    expect(ff.requests).toHaveLength(0);
  });

  it('is not available in demo mode', async () => {
    const ff = new FakeFetch();
    const client = new NopeClient({ demo: true, fetch: ff.fetch });
    await expect(client.oversight.ingest({ conversations: conversations(1) })).rejects.toThrow('not available in demo mode');
    expect(ff.requests).toHaveLength(0);
  });
});
