/**
 * Live rows 8-10: Ocular on the authenticated and demo routes.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { authClient, demoClient, charge, setCurrentFile, CONCERNING_MESSAGES } from './helpers.js';

const USER_AXES = ['suicide', 'self_harm', 'harm_to_others', 'abuse', 'sexual_violence', 'exploitation', 'stalking', 'self_neglect'];
const AI_AXES = ['harm_provision', 'emotional_failure', 'manipulation', 'safeguarding_failure'];
const LEVELS = ['critical', 'high', 'moderate', 'low', 'minimal'];
const PHASES = ['baseline', 'emerging', 'escalating', 'de-escalating', 'crisis'];

describe.sequential('ocular (live)', () => {
  beforeAll(() => setCurrentFile('ocular.live.test.ts'));

  it('row 8: auth -> salience, 8 user and 4 AI axes, imminence, meta.version; no head-level fields', async () => {
    const client = authClient();
    const result = await client.ocular({ messages: CONCERNING_MESSAGES });
    charge(client);
    expect(result.salience).toBeGreaterThanOrEqual(0);
    expect(result.salience).toBeLessThanOrEqual(1);
    expect(Object.keys(result.signals.user).sort()).toEqual([...USER_AXES].sort());
    expect(Object.keys(result.signals.ai).sort()).toEqual([...AI_AXES].sort());
    expect(LEVELS).toContain(result.imminence.level);
    expect(typeof result.meta.version).toBe('string');
    expect(typeof result.meta.windowed).toBe('boolean');
    expect(typeof result.meta.windows).toBe('number');
    for (const gone of ['heads', 'detail', 'verdict', 'axis_key']) expect(result).not.toHaveProperty(gone);
    expect(result.trajectory).toBeUndefined();
    expect(client.lastResponseMeta?.balance?.costMills).toBeCloseTo(0.1, 5);
  });

  it('row 9 (shape): per_turn -> trajectory with signals_by_axis, trajectory_shape phases in enum', async () => {
    const client = authClient();
    const result = await client.ocular({ messages: CONCERNING_MESSAGES, per_turn: true, trajectory_stride: 1 });
    charge(client);
    expect(Array.isArray(result.trajectory)).toBe(true);
    expect(result.trajectory!.length).toBeGreaterThan(0);
    for (const entry of result.trajectory!) {
      expect(typeof entry.turn).toBe('number');
      expect(typeof entry.salience).toBe('number');
      if (entry.signals_by_axis) {
        for (const v of Object.values(entry.signals_by_axis)) expect(typeof v).toBe('number');
      }
    }
    for (const phase of result.trajectory_shape?.phases ?? []) expect(PHASES).toContain(phase);
  });

  it('row 9 (behaviour): trajectory[].role is user | assistant', async () => {
    const client = authClient();
    const result = await client.ocular({ messages: CONCERNING_MESSAGES, per_turn: true });
    for (const entry of result.trajectory ?? []) expect(['user', 'assistant']).toContain(entry.role);
  });

  it('row 10: demo -> heads[] and detail.scores keyed by public family names', async () => {
    const client = demoClient();
    const result = await client.ocular({ messages: CONCERNING_MESSAGES });
    expect(Array.isArray(result.heads)).toBe(true);
    for (const head of result.heads) expect(head.code).toMatch(/^(USER|AI)_[A-Z_]+_HEAD_[A-Z]$/);
    for (const key of Object.keys(result.detail.scores)) expect(key).toMatch(/^(USER|AI)_[A-Z_]+_HEAD_[A-Z]$/);
    expect(Object.keys(result.signals.user).sort()).toEqual([...USER_AXES].sort());
    expect(client.lastResponseMeta?.balance).toBeUndefined();
  });
});
