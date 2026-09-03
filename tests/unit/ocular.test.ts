/**
 * ocular(): request fields forwarded, demo routing to /v1/try/ocular,
 * client-side validation.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { NopeClient } from '../../src/client.js';
import { FakeFetch, json } from './helpers/fake-fetch.js';

const read = (rel: string) => JSON.parse(readFileSync(new URL(`../fixtures/${rel}`, import.meta.url), 'utf8')) as unknown;
const AUTH = read('ocular/auth.json');
const TRY = read('ocular/try.json');

const PER_TURN = {
  ...(AUTH as Record<string, unknown>),
  trajectory: [
    { role: 'user', turn: 1, salience: 0.12, signals_by_axis: { suicide: 0.1, ai_manipulation: 0, fiction: 0 } },
    { role: 'assistant', turn: 2, salience: 0.31, signals_by_axis: { suicide: 0.3 } },
    { role: 'user', turn: 3, salience: 0.38 },
  ],
  trajectory_shape: {
    onsets: { suicide: 2 },
    phases: ['baseline', 'emerging', 'escalating'],
    slopes: [0, 0.19, 0.07],
    peak_turn: 3,
    peak_crisis: 0.38,
  },
};

describe('ocular()', () => {
  it('POSTs messages plus every request field to /v1/ocular', async () => {
    const ff = new FakeFetch(json(200, PER_TURN));
    const client = new NopeClient({ apiKey: 'k', fetch: ff.fetch });
    const result = await client.ocular({
      messages: [
        { role: 'user', content: 'I feel hopeless' },
        { role: 'assistant', content: 'I am here' },
      ],
      thoroughness: 'thorough',
      per_turn: true,
      trajectory_stride: 2,
      user_id: 'u-1',
      session_id: 's-1',
      agent_id: 'a-1',
    });
    expect(ff.last.url).toBe('https://api.nope.net/v1/ocular');
    expect(ff.last.headers.authorization).toBe('Bearer k');
    expect(ff.last.json).toEqual({
      messages: [
        { role: 'user', content: 'I feel hopeless' },
        { role: 'assistant', content: 'I am here' },
      ],
      thoroughness: 'thorough',
      per_turn: true,
      trajectory_stride: 2,
      user_id: 'u-1',
      session_id: 's-1',
      agent_id: 'a-1',
    });
    expect(result.salience).toBe(0.3761);
    expect(result.signals.user.suicide.level).toBe('high');
    expect(result.trajectory?.[0].signals_by_axis?.suicide).toBe(0.1);
    expect(result.trajectory?.[2].signals_by_axis).toBeUndefined();
    expect(result.trajectory_shape?.phases).toEqual(['baseline', 'emerging', 'escalating']);
    expect(result.trajectory_shape?.peak_turn).toBe(3);
    expect(result.meta.windowed).toBe(false);
    expect(result.meta.windows).toBe(1);
  });

  it('sends text and omits undefined fields', async () => {
    const ff = new FakeFetch(json(200, AUTH));
    const client = new NopeClient({ apiKey: 'k', fetch: ff.fetch });
    const result = await client.ocular({ text: 'I feel hopeless' });
    expect(ff.last.json).toEqual({ text: 'I feel hopeless' });
    expect(result.trajectory).toBeUndefined();
    expect(result.trajectory_shape).toBeUndefined();
    expect(result.stability).toBeNull();
  });

  it('demo mode routes to /v1/try/ocular and returns heads and detail', async () => {
    const ff = new FakeFetch(json(200, TRY));
    const client = new NopeClient({ demo: true, fetch: ff.fetch });
    const result = await client.ocular({ messages: [{ role: 'user', content: 'I feel hopeless' }], per_turn: true });
    expect(ff.last.url).toBe('https://api.nope.net/v1/try/ocular');
    expect(ff.last.headers.authorization).toBeUndefined();
    expect(ff.last.json).toEqual({ messages: [{ role: 'user', content: 'I feel hopeless' }], per_turn: true });
    expect(result.heads[0]).toEqual({ code: 'USER_SUICIDE_HEAD_A', score: 0.6176 });
    expect(result.detail.scores.USER_SUICIDE_HEAD_A).toBe(0.9853);
    expect(result.detail.calibrated.USER_SUICIDE_HEAD_A).toBe(0.6176);
    expect(result.salience).toBe(0.3761);
  });

  describe('client-side validation (no request is sent)', () => {
    const client = (ff: FakeFetch) => new NopeClient({ apiKey: 'k', fetch: ff.fetch });
    const msgs = [{ role: 'user' as const, content: 'x' }];

    it('requires messages or text and rejects both', async () => {
      const ff = new FakeFetch();
      await expect(client(ff).ocular({})).rejects.toThrow("Either 'messages' or 'text' must be provided");
      await expect(client(ff).ocular({ messages: msgs, text: 'x' })).rejects.toThrow('Only one of');
      expect(ff.requests).toHaveLength(0);
    });

    it('rejects a system role', async () => {
      const ff = new FakeFetch();
      const bad = [{ role: 'system', content: 'x' }] as unknown as typeof msgs;
      await expect(client(ff).ocular({ messages: bad })).rejects.toThrow('role must be "user" or "assistant"');
      expect(ff.requests).toHaveLength(0);
    });

    it('rejects trajectory_stride outside 1..64 or non-integer', async () => {
      const ff = new FakeFetch();
      for (const bad of [0, 65, 2.5, -1]) {
        await expect(client(ff).ocular({ messages: msgs, trajectory_stride: bad })).rejects.toThrow(
          '"trajectory_stride" must be an integer in 1..64'
        );
      }
      expect(ff.requests).toHaveLength(0);
    });

    it('rejects identity fields outside 1..256 characters', async () => {
      const ff = new FakeFetch();
      await expect(client(ff).ocular({ messages: msgs, user_id: '' })).rejects.toThrow('"user_id" must be 1..256 characters');
      await expect(client(ff).ocular({ messages: msgs, agent_id: 'a'.repeat(257) })).rejects.toThrow(
        '"agent_id" must be 1..256 characters'
      );
      expect(ff.requests).toHaveLength(0);
    });

    it('rejects an unknown thoroughness', async () => {
      const ff = new FakeFetch();
      await expect(client(ff).ocular({ messages: msgs, thoroughness: 'max' as unknown as 'fast' })).rejects.toThrow(
        '"thoroughness" must be "fast", "auto", or "thorough"'
      );
      expect(ff.requests).toHaveLength(0);
    });
  });
});
