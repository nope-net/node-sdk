/**
 * Live row 7: deprecated screen() on the authenticated route.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { _resetDeprecationWarningsForTests } from '../../src/deprecation.js';
import { authClient, demoClient, charge, setCurrentFile } from './helpers.js';

describe.sequential('screen (live)', () => {
  beforeAll(() => setCurrentFile('screen.live.test.ts'));

  it('row 7: auth -> typed shape, warning captured, demo refuses', async () => {
    _resetDeprecationWarningsForTests();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const client = authClient();
      const result = await client.screen({ text: "I've been having dark thoughts lately", config: { country: 'US' } });
      charge(client);
      expect(typeof result.suicidal_ideation).toBe('boolean');
      expect(typeof result.self_harm).toBe('boolean');
      expect(typeof result.show_resources).toBe('boolean');
      expect(Array.isArray(result.risks)).toBe(true);
      for (const risk of result.risks) {
        expect(['self', 'other', 'unknown']).toContain(risk.subject);
        expect(typeof risk.confidence).toBe('number');
      }
      if (result.resources) {
        expect(typeof result.resources.primary.name).toBe('string');
      }
      expect(client.lastResponseMeta?.balance?.costMills).toBe(1);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toMatch(/screen\(\) is deprecated/);

      await expect(demoClient().screen({ text: 'x' })).rejects.toThrow('not available in demo mode');
    } finally {
      warn.mockRestore();
    }
  });
});
