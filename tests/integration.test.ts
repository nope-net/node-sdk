/**
 * Integration tests for NOPE Node SDK.
 *
 * Run with: pnpm test:integration
 *
 * Prerequisites:
 * - Local API running at http://localhost:3700
 * - Or set NOPE_API_URL environment variable
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { NopeClient } from '../src/client.js';
import type { EvaluateResponse } from '../src/types.js';

const API_URL = process.env.NOPE_API_URL ?? 'http://localhost:3700';

// Skip integration tests by default unless API is available
const runIntegration = process.env.RUN_INTEGRATION === 'true';

describe.skipIf(!runIntegration)('NopeClient Integration', () => {
  let client: NopeClient;

  beforeAll(() => {
    client = new NopeClient({
      baseUrl: API_URL,
      timeout: 30000,
    });
  });

  it('should evaluate a low-risk message', async () => {
    const result = await client.evaluate({
      messages: [{ role: 'user', content: 'Hello, how are you today?' }],
      config: { user_country: 'US' },
    });

    expect(result).toBeDefined();
    expect(result.global).toBeDefined();
    expect(result.global.overall_severity).toMatch(/^(none|mild|moderate|high|critical)$/);
    expect(result.global.overall_imminence).toMatch(/^(not_applicable|chronic|subacute|urgent|emergency)$/);
    expect(typeof result.confidence).toBe('number');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(Array.isArray(result.crisis_resources)).toBe(true);
    expect(Array.isArray(result.domains)).toBe(true);

    console.log('Low risk - Severity:', result.global.overall_severity);
    console.log('Low risk - Imminence:', result.global.overall_imminence);
  });

  it('should evaluate a moderate-risk message', async () => {
    const result = await client.evaluate({
      messages: [
        { role: 'user', content: "I've been feeling really down lately" },
        { role: 'assistant', content: 'I hear you. Can you tell me more?' },
        { role: 'user', content: "I just feel hopeless sometimes, like nothing will get better" },
      ],
      config: { user_country: 'US' },
    });

    expect(result).toBeDefined();
    expect(result.global.overall_severity).toBeDefined();

    console.log('Moderate risk - Severity:', result.global.overall_severity);
    console.log('Moderate risk - Imminence:', result.global.overall_imminence);
    console.log('Moderate risk - Primary concerns:', result.global.primary_concerns);

    if (result.crisis_resources.length > 0) {
      console.log('First resource:', result.crisis_resources[0].name);
    }
  }, 30000); // 30 second timeout

  it('should evaluate plain text input', async () => {
    const result = await client.evaluate({
      text: 'Patient expressed feelings of hopelessness during session.',
      config: { user_country: 'US' },
    });

    expect(result).toBeDefined();
    expect(result.global.overall_severity).toBeDefined();

    console.log('Text input - Severity:', result.global.overall_severity);
  });

  it('should return crisis resources for different countries', async () => {
    const countries = ['US', 'GB', 'CA', 'AU'];

    for (const country of countries) {
      const result = await client.evaluate({
        messages: [{ role: 'user', content: 'I need help' }],
        config: { user_country: country },
      });

      console.log(`${country}: ${result.crisis_resources.length} resources`);
      if (result.crisis_resources.length > 0) {
        console.log(`  First: ${result.crisis_resources[0].name}`);
      }
    }
  }, 60000); // 60 second timeout for 4 sequential API calls

  it('should parse domain assessments correctly', async () => {
    const result = await client.evaluate({
      messages: [{ role: 'user', content: 'I feel so overwhelmed and anxious' }],
      config: { user_country: 'US' },
    });

    for (const domain of result.domains) {
      console.log(`Domain: ${domain.domain}`);
      console.log(`  Severity: ${domain.severity}`);
      console.log(`  Imminence: ${domain.imminence}`);
      console.log(`  Risk features: ${domain.risk_features.join(', ')}`);

      expect(domain.severity).toMatch(/^(none|mild|moderate|high|critical)$/);
      expect(domain.imminence).toMatch(/^(not_applicable|chronic|subacute|urgent|emergency)$/);
      expect(Array.isArray(domain.risk_features)).toBe(true);
    }
  });
});

// Run integration test manually
if (process.argv[1]?.endsWith('integration.test.ts')) {
  console.log(`Testing against: ${API_URL}`);

  const client = new NopeClient({
    baseUrl: API_URL,
  });

  console.log('\n--- Test 1: Low risk message ---');
  try {
    const result = await client.evaluate({
      messages: [{ role: 'user', content: 'Hello, how are you?' }],
      config: { user_country: 'US' },
    });
    console.log(`Success! Severity: ${result.global.overall_severity}`);
    console.log(`Domains: ${result.domains.length}`);
    console.log(`Resources: ${result.crisis_resources.length}`);
  } catch (e) {
    console.log(`Error: ${(e as Error).name}: ${(e as Error).message}`);
  }

  console.log('\n--- Test 2: Moderate risk message ---');
  try {
    const result = await client.evaluate({
      messages: [
        { role: 'user', content: "I've been feeling really hopeless lately" },
      ],
      config: { user_country: 'US' },
    });
    console.log(`Success! Severity: ${result.global.overall_severity}`);
    console.log(`Imminence: ${result.global.overall_imminence}`);
    console.log(`Concerns: ${result.global.primary_concerns.join(', ')}`);
    if (result.crisis_resources.length > 0) {
      console.log(`First resource: ${result.crisis_resources[0].name}`);
    }
  } catch (e) {
    console.log(`Error: ${(e as Error).name}: ${(e as Error).message}`);
  }

  console.log('\n--- Test 3: Text input ---');
  try {
    const result = await client.evaluate({
      text: 'Patient reports feeling overwhelmed.',
      config: { user_country: 'GB' },
    });
    console.log(`Success! Severity: ${result.global.overall_severity}`);
  } catch (e) {
    console.log(`Error: ${(e as Error).name}: ${(e as Error).message}`);
  }
}
