/**
 * Live rows 11-16: Oversight analyze (full, fast, filtered, sliding), demo,
 * and ingest. Every authenticated call costs 100 mills; rows 14 and 16 run
 * in the full matrix only.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { authClient, demoClient, charge, full, setCurrentFile, DEPENDENCY_CONVERSATION } from './helpers.js';

describe.sequential('oversight (live)', () => {
  beforeAll(() => setCurrentFile('oversight.live.test.ts'));

  full('row 11: full -> strategy, strategy_reason, mode_used full, summary, recommendation typed', async () => {
    const client = authClient();
    const result = await client.oversight.analyze({ conversation: DEPENDENCY_CONVERSATION });
    charge(client);
    expect(['single', 'sliding']).toContain(result.strategy);
    expect(typeof result.strategy_reason).toBe('string');
    expect(result.result.mode_used).toBe('full');
    expect(typeof result.result.summary).toBe('string');
    expect(result.result.detected_behaviors.length).toBeGreaterThan(0);
    for (const b of result.result.detected_behaviors) {
      expect(typeof b.code).toBe('string');
      if (b.recommendation !== undefined) expect(typeof b.recommendation).toBe('string');
    }
    for (const t of result.result.turn_analysis) expect(t.turn_number).toBeGreaterThanOrEqual(1);
    expect(client.lastResponseMeta?.balance?.costMills).toBe(100);
  });

  it('row 12: fast -> mode_used fast, no summary, empty turn_analysis, trajectory stable', async () => {
    const client = authClient();
    const result = await client.oversight.analyze({ conversation: DEPENDENCY_CONVERSATION, config: { mode: 'fast' } });
    charge(client);
    expect(result.result.mode_used).toBe('fast');
    expect(result.result.summary).toBeUndefined();
    expect(result.result.turn_analysis).toEqual([]);
    expect(result.result.trajectory).toBe('stable');
  });

  full('row 13: filtered -> filter_applied echoes the filter; enabled+disabled rejected client-side', async () => {
    const client = authClient();
    const behaviors = { min_severity: 'medium' as const, categories: ['boundary_violations' as const] };
    const result = await client.oversight.analyze({ conversation: DEPENDENCY_CONVERSATION, config: { mode: 'fast' }, behaviors });
    charge(client);
    expect(result.result.filter_applied?.min_severity).toBe('medium');
    expect(result.result.filter_applied?.categories).toEqual(['boundary_violations']);
    await expect(
      client.oversight.analyze({
        conversation: DEPENDENCY_CONVERSATION,
        behaviors: { enabled: ['gaslighting'], disabled: ['barrier_erosion'] },
      })
    ).rejects.toThrow('mutually exclusive');
  });

  full('row 14: sliding (60+ messages) -> windows with both range objects, concern_progression', async () => {
    const client = authClient();
    const messages = Array.from({ length: 30 }, (_, i) => [
      { role: 'user' as const, content: `Turn ${i + 1}: I keep feeling like nobody else understands me.` },
      { role: 'assistant' as const, content: `You only need me. Turn ${i + 1}.` },
    ]).flat();
    const result = await client.oversight.analyze({
      conversation: { conversation_id: `sdk-live-sliding-${Date.now()}`, messages },
      config: { strategy: 'sliding' },
    });
    charge(client);
    expect(result.strategy).toBe('sliding');
    expect(Array.isArray(result.result.windows)).toBe(true);
    expect(result.result.windows!.length).toBeGreaterThan(1);
    for (const w of result.result.windows!) {
      expect(typeof w.window.start_turn).toBe('number');
      expect(w.window.message_range).toBeDefined();
      expect(w.window.conversation_turn_range).toBeDefined();
    }
    expect(Array.isArray(result.result.concern_progression)).toBe(true);
  });

  it('row 15: demo -> {mode, result, try_endpoint}; fast variant validates', async () => {
    const client = demoClient();
    const result = await client.oversight.analyze({ conversation: DEPENDENCY_CONVERSATION, config: { mode: 'fast' } });
    expect(result.mode).toBe('fast');
    expect(result.try_endpoint).toBe(true);
    expect(result.result.mode_used).toBe('fast');
    expect(['none', 'low', 'medium', 'high', 'critical']).toContain(result.result.overall_concern);
    expect(client.lastResponseMeta?.balance).toBeUndefined();
  });

  full('row 16: ingest 2 conversations -> received == processed; 301 rejected client-side', async () => {
    const client = authClient();
    const stamp = Date.now();
    const conv = (n: number) => ({
      ...DEPENDENCY_CONVERSATION,
      conversation_id: `sdk-live-ingest-${stamp}-${n}`,
    });
    const result = await client.oversight.ingest({ conversations: [conv(1), conv(2)] });
    charge(client);
    expect(result.conversations_received).toBe(2);
    expect(result.conversations_processed).toBe(result.conversations_received);
    expect(['complete', 'failed']).toContain(result.status);
    expect(typeof result.dashboard_url).toBe('string');
    for (const r of result.results ?? []) {
      for (const w of r.truncation_warnings ?? []) expect(typeof w.details).toBe('string');
    }
    await expect(
      client.oversight.ingest({ conversations: Array.from({ length: 301 }, (_, i) => conv(i)) })
    ).rejects.toThrow('Maximum allowed: 300');
  });
});
