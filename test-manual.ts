/**
 * Manual integration test for NOPE Node SDK.
 *
 * Run with: npx tsx test-manual.ts
 */

import { NopeClient } from './src/client.js';

const API_URL = process.env.NOPE_API_URL ?? 'http://localhost:8788';

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

console.log('\n--- Test 4: Parse all domain types ---');
try {
  const result = await client.evaluate({
    messages: [{ role: 'user', content: 'I feel so overwhelmed and anxious' }],
    config: { user_country: 'US' },
  });
  console.log(`Success! Domains found: ${result.domains.length}`);
  for (const domain of result.domains) {
    console.log(`  Domain: ${domain.domain}`);
    console.log(`    Severity: ${domain.severity}`);
    console.log(`    Imminence: ${domain.imminence}`);
    console.log(`    Risk features: ${domain.risk_features.join(', ')}`);
  }
} catch (e) {
  console.log(`Error: ${(e as Error).name}: ${(e as Error).message}`);
}

console.log('\n--- All tests complete ---');
