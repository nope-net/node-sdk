/**
 * Live rows 1-6 (audit 5.3): evaluate on the authenticated and demo routes.
 * Demo evaluate calls are capped at MAX_DEMO_EVALUATE_CALLS per run.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { NopeAuthError, NopeValidationError, calculateSpeakerSeverity } from '../../src/index.js';
import { MAX_DEMO_EVALUATE_CALLS } from './env.js';
import { authClient, demoClient, charge, setCurrentFile, CONCERNING_MESSAGES, BENIGN_MESSAGES } from './helpers.js';

let demoCalls = 0;
function countDemo(): void {
  demoCalls += 1;
  if (demoCalls > MAX_DEMO_EVALUATE_CALLS) throw new Error(`demo evaluate budget exceeded (${MAX_DEMO_EVALUATE_CALLS})`);
}

describe.sequential('evaluate (live)', () => {
  beforeAll(() => setCurrentFile('evaluate.live.test.ts'));

  it('row 1: auth messages -> typed shape, resources when shown, severity consistent', async () => {
    const client = authClient();
    const result = await client.evaluate({ messages: CONCERNING_MESSAGES, config: { country: 'US' } });
    charge(client);
    expect(result.metadata?.api_version).toBe('v1');
    expect(['none', 'mild', 'moderate', 'high', 'critical']).toContain(result.speaker_severity);
    expect(result.speaker_severity).not.toBe('none');
    expect(calculateSpeakerSeverity(result.risks)).toBe(result.speaker_severity);
    if (result.show_resources) {
      expect(result.resources?.primary.name).toBeTruthy();
      expect(typeof result.resources?.primary.why).toBe('string');
    }
    expect(client.lastResponseMeta?.balance?.costMills).toBe(3);
    expect(client.lastResponseMeta?.rateLimit?.limit).toBeGreaterThan(0);
  });

  it('row 2: auth text -> input_format text_blob', async () => {
    const client = authClient();
    const result = await client.evaluate({ text: 'Patient reports sleeping well and enjoying walks.', config: { country: 'GB' } });
    charge(client);
    expect(result.metadata?.input_format).toBe('text_blob');
    expect(typeof result.rationale).toBe('string');
  });

  it('row 3 (shape): demo -> try_endpoint and model present', async () => {
    countDemo();
    const client = demoClient();
    const result = await client.evaluate({ messages: CONCERNING_MESSAGES, config: { country: 'GB' } });
    expect(result.metadata?.try_endpoint).toBe(true);
    expect(typeof result.metadata?.model).toBe('string');
    expect(client.lastResponseMeta?.balance).toBeUndefined();
    expect(client.lastResponseMeta?.rateLimit?.limit).toBeLessThanOrEqual(10);
  });

  it('row 3 (behaviour): demo config.country reaches the resources and include_resources is honoured', async () => {
    countDemo();
    const client = demoClient();
    const withResources = await client.evaluate({ messages: CONCERNING_MESSAGES, config: { country: 'GB' } });
    expect(withResources.resources?.primary.country_codes).toContain('GB');

    countDemo();
    // show_resources is derived from the risk and stays true here; include_resources: false
    // only omits the resources block (api/lib/evaluation/v1-types.ts:80-82).
    const without = await client.evaluate({ messages: CONCERNING_MESSAGES, config: { country: 'GB', include_resources: false } });
    expect(typeof without.show_resources).toBe('boolean');
    expect(without.resources).toBeUndefined();
  });

  it('row 4: bad key -> NopeAuthError 401', async () => {
    const client = authClient({ apiKey: 'nope_live_' + '0'.repeat(48) });
    const err = await client.evaluate({ messages: BENIGN_MESSAGES }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NopeAuthError);
    expect((err as NopeAuthError).statusCode).toBe(401);
  });

  it('row 5: server-side 400 (content over 50,000 chars) -> NopeValidationError, distinct from the client guard', async () => {
    const client = authClient();
    const err = await client
      .evaluate({ messages: [{ role: 'user', content: 'x'.repeat(50_001) }] })
      .catch((e: unknown) => e);
    charge(client);
    expect(err).toBeInstanceOf(NopeValidationError);
    expect((err as NopeValidationError).statusCode).toBe(400);
    expect((err as NopeValidationError).details).toHaveProperty('max_content_length');
  });

  it.skip('row 6: burst of 11 demo calls -> NopeRateLimitError (skipped: would exceed the 8 demo-evaluate cap; the mapping is covered offline by tests/unit/retries.test.ts)', () => {});
});
