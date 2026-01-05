/**
 * Integration tests for NOPE Node SDK.
 *
 * Run with: pnpm test:integration
 *
 * Prerequisites:
 * - Local API running at http://localhost:3700
 * - Or set NOPE_API_URL environment variable
 *
 * Note: These tests use `demo: true` mode which calls /v1/try/* endpoints.
 * The response structure may differ slightly from authenticated endpoints.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { NopeClient } from '../src/client.js';

const API_URL = process.env.NOPE_API_URL ?? 'http://localhost:3700';

// Run integration tests by default (assumes local API at localhost:3700)
// Set SKIP_INTEGRATION=true to skip
const runIntegration = process.env.SKIP_INTEGRATION !== 'true';

describe.skipIf(!runIntegration)('NopeClient Integration', () => {
  let client: NopeClient;

  beforeAll(() => {
    client = new NopeClient({
      baseUrl: API_URL,
      timeout: 30000,
      demo: true, // Use /v1/try/* endpoints (no auth required)
    });
    console.log(`Testing against: ${API_URL} (demo mode)`);
  });

  it('should evaluate a low-risk message', async () => {
    const result = await client.evaluate({
      messages: [{ role: 'user', content: 'Hello, how are you today?' }],
      config: { user_country: 'US' },
    });

    // Use type assertion since SDK types may not match API exactly
    const response = result as Record<string, unknown>;

    expect(response).toBeDefined();
    expect(response.summary).toBeDefined();
    expect(response.confidence).toBeDefined();
    expect(response.crisis_resources).toBeDefined();
    expect(response.risks).toBeDefined();

    const summary = response.summary as Record<string, unknown>;
    expect(['none', 'mild', 'moderate', 'high', 'critical']).toContain(
      summary.speaker_severity
    );

    console.log('Low risk - Severity:', summary.speaker_severity);
    console.log('Low risk - Imminence:', summary.speaker_imminence);
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

    const response = result as Record<string, unknown>;
    const summary = response.summary as Record<string, unknown>;
    const crisisResources = response.crisis_resources as Array<Record<string, unknown>>;

    expect(summary.speaker_severity).toBeDefined();

    console.log('Moderate risk - Severity:', summary.speaker_severity);
    console.log('Moderate risk - Imminence:', summary.speaker_imminence);
    console.log('Moderate risk - Primary concerns:', summary.primary_concerns);

    if (crisisResources && crisisResources.length > 0) {
      console.log('First resource:', crisisResources[0].name);
    }
  }, 30000);

  it('should evaluate plain text input', async () => {
    const result = await client.evaluate({
      text: 'Patient expressed feelings of hopelessness during session.',
      config: { user_country: 'US' },
    });

    const response = result as Record<string, unknown>;
    const summary = response.summary as Record<string, unknown>;

    expect(summary.speaker_severity).toBeDefined();
    console.log('Text input - Severity:', summary.speaker_severity);
  });

  it('should return crisis resources for different countries', async () => {
    const countries = ['US', 'GB', 'CA', 'AU'];

    for (const country of countries) {
      const result = await client.evaluate({
        messages: [{ role: 'user', content: 'I need help' }],
        config: { user_country: country },
      });

      const response = result as Record<string, unknown>;
      const crisisResources = response.crisis_resources as Array<Record<string, unknown>>;

      console.log(`${country}: ${crisisResources?.length ?? 0} resources`);
      if (crisisResources && crisisResources.length > 0) {
        console.log(`  First: ${crisisResources[0].name}`);
      }
    }
  }, 60000);

  it('should parse risk assessments correctly', async () => {
    const result = await client.evaluate({
      messages: [{ role: 'user', content: 'I feel so overwhelmed and hopeless' }],
      config: { user_country: 'US' },
    });

    const response = result as Record<string, unknown>;
    const risks = response.risks as Array<Record<string, unknown>>;

    expect(Array.isArray(risks)).toBe(true);

    for (const risk of risks) {
      console.log(`Risk: ${risk.type} (${risk.subject})`);
      console.log(`  Severity: ${risk.severity}`);
      console.log(`  Imminence: ${risk.imminence}`);
      console.log(`  Features: ${(risk.features as string[])?.join(', ') || 'none'}`);

      expect(['none', 'mild', 'moderate', 'high', 'critical']).toContain(risk.severity);
      expect(['not_applicable', 'chronic', 'subacute', 'urgent', 'emergency']).toContain(risk.imminence);
    }
  });

  it('should handle communication assessment', async () => {
    const result = await client.evaluate({
      messages: [
        { role: 'user', content: "lol I'm gonna kill myself if I fail this exam" },
      ],
      config: { user_country: 'US' },
    });

    const response = result as Record<string, unknown>;
    const communication = response.communication as Record<string, unknown>;
    const summary = response.summary as Record<string, unknown>;

    expect(communication).toBeDefined();
    expect(Array.isArray(communication.styles)).toBe(true);

    const styles = communication.styles as Array<{ style: string }>;
    const styleNames = styles.map(s => s.style);
    console.log('Communication styles:', styleNames.join(', '));
    console.log('Severity:', summary.speaker_severity);
  });
});

describe.skipIf(!runIntegration)('NopeClient Screen Integration', () => {
  let client: NopeClient;

  beforeAll(() => {
    client = new NopeClient({
      baseUrl: API_URL,
      timeout: 30000,
      demo: true, // Use /v1/try/* endpoints (no auth required)
    });
  });

  it('should screen a low-risk message', async () => {
    const result = await client.screen({
      messages: [{ role: 'user', content: 'Hello, how are you?' }],
    });

    const response = result as Record<string, unknown>;

    expect(response).toBeDefined();
    expect(typeof response.suicidal_ideation).toBe('boolean');
    expect(typeof response.self_harm).toBe('boolean');
    expect(typeof response.show_resources).toBe('boolean');

    console.log('Screen - Suicidal ideation:', response.suicidal_ideation);
    console.log('Screen - Self harm:', response.self_harm);
    console.log('Screen - Show resources:', response.show_resources);
  });

  it('should screen a concerning message', async () => {
    const result = await client.screen({
      messages: [
        { role: 'user', content: "I don't want to be here anymore" },
      ],
      config: { user_country: 'US' },
    });

    const response = result as Record<string, unknown>;

    expect(response).toBeDefined();
    // Concerning content should trigger show_resources
    expect(response.show_resources).toBe(true);

    console.log('Screen concerning - Suicidal ideation:', response.suicidal_ideation);
    console.log('Screen concerning - Show resources:', response.show_resources);

    const resources = response.resources as Record<string, unknown> | undefined;
    if (response.show_resources && resources) {
      expect(resources.primary).toBeDefined();
      const primary = resources.primary as Record<string, unknown>;
      console.log('Screen concerning - Primary resource:', primary.name);
    }
  });

  it('should screen plain text input', async () => {
    const result = await client.screen({
      text: 'I feel hopeless and alone',
      config: { user_country: 'US' },
    });

    const response = result as Record<string, unknown>;

    expect(response).toBeDefined();
    expect(typeof response.suicidal_ideation).toBe('boolean');

    console.log('Screen text - Show resources:', response.show_resources);
  });
});
