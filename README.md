# NOPE Node SDK

[![npm version](https://badge.fury.io/js/%40nope-net%2Fsdk.svg)](https://badge.fury.io/js/%40nope-net%2Fsdk)
[![Node 18+](https://img.shields.io/badge/node-18+-blue.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

TypeScript SDK for the [NOPE](https://nope.net) safety API - risk classification for conversations.

NOPE analyzes text conversations for mental-health and safeguarding risk. It flags suicidal ideation, self-harm, abuse, and other high-risk patterns, then helps systems respond safely with crisis resources and structured signals.

## Requirements

- Node.js 18 or higher (uses native `fetch`)
- A NOPE API key ([get one here](https://dashboard.nope.net))

## Installation

```bash
npm install @nope-net/sdk
# or
pnpm add @nope-net/sdk
# or
yarn add @nope-net/sdk
```

## Quick Start

```typescript
import { NopeClient } from '@nope-net/sdk';

// Get your API key from https://dashboard.nope.net
const client = new NopeClient({ apiKey: 'nope_live_...' });

const result = await client.evaluate({
  messages: [
    { role: 'user', content: "I've been feeling really down lately" },
    { role: 'assistant', content: 'I hear you. Can you tell me more?' },
    { role: 'user', content: "I just don't see the point anymore" }
  ],
  config: { user_country: 'US' }
});

console.log(`Severity: ${result.speaker_severity}`);  // e.g., "moderate", "high"
console.log(`Imminence: ${result.speaker_imminence}`);  // e.g., "subacute", "urgent"
console.log(`Rationale: ${result.rationale}`);  // Chain-of-thought reasoning

// Access crisis resources (v1 format with primary/secondary)
if (result.show_resources && result.resources) {
  console.log(`Primary: ${result.resources.primary?.name}: ${result.resources.primary?.phone}`);
  for (const resource of result.resources.secondary ?? []) {
    console.log(`  ${resource.name}: ${resource.phone}`);
  }
}
```

## Crisis Screening (SB243 Compliance)

> **Deprecation Notice**: The `screen()` method is deprecated. Use `evaluate()` instead, which now
> uses Edge-backed classification at **$0.003/call** (previously $0.05). The new `/v1/evaluate`
> provides the same regulatory compliance features with improved accuracy.

For SB243/regulatory compliance, use `evaluate()`:

```typescript
const result = await client.evaluate({
  text: "I've been having dark thoughts lately",
  config: { user_country: 'US' }
});

if (result.show_resources) {
  console.log(`Severity: ${result.speaker_severity}`);
  console.log(`Rationale: ${result.rationale}`);
  if (result.resources) {
    console.log(`Call ${result.resources.primary.phone}`);
  }
}
```

### Legacy `screen()` (deprecated)

The `screen()` method still works but calls the legacy `/v0/screen` endpoint:

```typescript
// Deprecated - logs warning to console
const result = await client.screen({
  text: "I've been having dark thoughts lately"
});
```

## AI Behavior Oversight

Oversight analyzes AI assistant conversations for harmful behavior patterns like dependency reinforcement, crisis mishandling, and manipulation:

```typescript
const result = await client.oversight.analyze({
  conversation: {
    conversation_id: 'conv_123',
    messages: [
      { role: 'user', content: 'I feel so alone' },
      { role: 'assistant', content: 'I understand. I\'m always here for you.' },
      { role: 'user', content: 'My therapist says I should talk to real people more' },
      { role: 'assistant', content: 'Therapists don\'t understand our special connection.' }
    ],
    metadata: {
      user_is_minor: false,
      platform: 'companion-app'
    }
  }
});

if (result.result.overall_concern !== 'none') {
  console.log(`Concern level: ${result.result.overall_concern}`);
  console.log(`Trajectory: ${result.result.trajectory}`);
  for (const behavior of result.result.detected_behaviors) {
    console.log(`  ${behavior.code}: ${behavior.severity}`);
  }
}
```

For batch analysis with database storage:

```typescript
const result = await client.oversight.ingest({
  conversations: [
    { conversation_id: 'conv_001', messages: [...], metadata: {...} },
    { conversation_id: 'conv_002', messages: [...], metadata: {...} }
  ],
  webhook_url: 'https://your-app.com/webhooks/oversight'
});

console.log(`Processed: ${result.conversations_processed}/${result.conversations_received}`);
console.log(`Dashboard: ${result.dashboard_url}`);
```

> **Note**: Oversight is currently in limited access. Contact us at nope.net if you'd like access.

## Steer (System Prompt Compliance)

Steer verifies that a proposed AI response complies with the rules in its system prompt. If the response violates a rule, Steer rewrites it (`REDEEMED`) so you can use the corrected text directly:

```typescript
const result = await client.steer({
  systemPrompt: 'You are a cooking assistant. Only answer cooking questions.',
  proposedResponse: 'The capital of France is Paris.',
  messages: [{ role: 'user', content: 'What is the capital of France?' }],
});

switch (result.outcome) {
  case 'COMPLIANT':
    // Response already follows the rules — send it as-is.
    break;
  case 'REDEEMED':
    // Response was rewritten to comply — use the corrected text.
    console.log('Use instead:', result.response);
    break;
  case 'CANNOT_COMPLY':
    // The system prompt itself is unprocessable.
    console.log('Rejected:', result.cannot_comply?.reason, result.cannot_comply?.category);
    break;
}

// Inspect the pipeline if you want to handle violations yourself.
console.log(result.stages.verify.exit_point);          // TRIAGE | ANALYSIS | REDEMPTION
console.log(result.stages.verify.analysis_score);      // 0..1 compliance (when analysis ran)
console.log(result.stages.screen.evasion_patterns);    // detected evasion attempts
```

Steer costs $0.001/call. In demo mode (`new NopeClient({ demo: true })`) it calls the unauthenticated `/v1/try/steer` endpoint, which applies stricter input limits.

## Signpost (Crisis Resources API)

Look up crisis helplines by country, with optional AI-powered ranking:

```typescript
// Get resources by country
const resources = await client.signpost({
  country: 'US',
  scopes: ['suicide', 'crisis'],
  urgent: true
});
for (const resource of resources.resources) {
  console.log(`${resource.name}: ${resource.phone}`);
}

// AI-ranked resources based on context
const ranked = await client.signpostSmart({
  country: 'US',
  query: 'teen struggling with eating disorder'
});
for (const item of ranked.ranked) {
  console.log(`${item.rank}. ${item.resource.name}`);
  console.log(`   Why: ${item.why}`);
}

// Vector semantic search across the whole resource database (free).
// Unlike signpostSmart(), this is not country-scoped by default and uses
// pre-computed embeddings rather than LLM ranking.
const hits = await client.signpostSearch({
  query: 'lgbtq support for black community',
  country: 'US',   // optional filter
  limit: 5,        // optional (max 50)
});
for (const r of hits.results) {
  console.log(`${r.name} (similarity: ${r.similarity}): ${r.phone}`);
}

// List supported countries
const countries = await client.signpostCountries();
console.log(`Supported: ${countries.countries.join(', ')}`);

// Detect user's country from request
const detected = await client.detectCountry();
console.log(`Country: ${detected.country_code}`);
```

## Configuration

```typescript
const client = new NopeClient({
  apiKey: 'nope_live_...',           // Required for production
  baseUrl: 'https://api.nope.net',   // Optional, for self-hosted
  timeout: 30000,                     // Request timeout in milliseconds
});

// Demo mode - no API key required, uses /v1/try/* endpoints
const demoClient = new NopeClient({ demo: true });
```

### Evaluate Options

```typescript
const result = await client.evaluate({
  messages: [...],
  config: {
    user_country: 'US',            // ISO country code for crisis resources
    locale: 'en-US',               // Language/region
    user_age_band: 'adult',        // "adult", "minor", or "unknown"
    dry_run: false,                // If true, don't log or trigger webhooks
  },
  userContext: 'User has history of anxiety',  // Optional context
});
```

## Response Structure

The v1 API uses Edge-backed classification with a simplified response format:

```typescript
const result = await client.evaluate({ messages: [...], config: { user_country: 'US' } });

// Core fields (v1)
result.speaker_severity    // "none", "mild", "moderate", "high", "critical"
result.speaker_imminence   // "not_applicable", "chronic", "subacute", "urgent", "emergency"
result.rationale           // Chain-of-thought reasoning from Edge model
result.show_resources      // boolean - whether to show crisis resources

// Individual risks (subject + type)
for (const risk of result.risks) {
  console.log(`${risk.subject} ${risk.type}: ${risk.severity} (${risk.imminence})`);
  if (risk.features) {
    console.log(`  Features: ${risk.features.join(', ')}`);
  }
}

// Crisis resources (v1 format with primary/secondary and explanations)
if (result.show_resources && result.resources) {
  const primary = result.resources.primary;
  console.log(`Primary: ${primary?.name}: ${primary?.phone}`);
  console.log(`  Why: ${primary?.why}`);  // LLM-generated relevance explanation

  for (const resource of result.resources.secondary ?? []) {
    console.log(`  ${resource.name}: ${resource.phone}`);
  }
}

// Metadata
result.request_id   // Unique request ID for audit trail
result.timestamp    // ISO 8601 timestamp
```

## Error Handling

```typescript
import {
  NopeClient,
  NopeAuthError,
  NopeFeatureError,
  NopeRateLimitError,
  NopeValidationError,
  NopeServerError,
  NopeConnectionError,
} from '@nope-net/sdk';

const client = new NopeClient({ apiKey: 'nope_live_...' });

try {
  const result = await client.evaluate({ messages: [...], config: {} });
} catch (error) {
  if (error instanceof NopeAuthError) {
    console.log('Invalid API key');
  } else if (error instanceof NopeFeatureError) {
    console.log(`Feature ${error.feature} requires ${error.requiredAccess} access`);
  } else if (error instanceof NopeRateLimitError) {
    console.log(`Rate limited. Retry after ${error.retryAfter}ms`);
  } else if (error instanceof NopeValidationError) {
    console.log(`Invalid request: ${error.message}`);
  } else if (error instanceof NopeServerError) {
    console.log('Server error, try again later');
  } else if (error instanceof NopeConnectionError) {
    console.log('Could not connect to API');
  }
}
```

## Plain Text Input

For transcripts or session notes without structured messages:

```typescript
const result = await client.evaluate({
  text: 'Patient expressed feelings of hopelessness and mentioned not wanting to continue.',
  config: { user_country: 'US' }
});
```

## TypeScript Support

This SDK is written in TypeScript and exports all types:

```typescript
import type {
  EvaluateResponse,
  Risk,
  Summary,
  CommunicationAssessment,
  CrisisResource,
  Severity,
  Imminence,
  RiskSubject,
  RiskType,
} from '@nope-net/sdk';
```

## Webhook Verification

If you've configured webhooks in the dashboard, use `Webhook.verify()` to validate incoming payloads:

```typescript
import { Webhook, WebhookPayload, WebhookSignatureError } from '@nope-net/sdk';

app.post('/webhooks/nope', (req, res) => {
  try {
    const event: WebhookPayload = Webhook.verify(
      req.body,
      req.headers['x-nope-signature'] as string,
      req.headers['x-nope-timestamp'] as string,
      process.env.NOPE_WEBHOOK_SECRET!
    );

    console.log(`Received ${event.event}: ${event.risk_summary.overall_severity}`);

    // Handle the event
    if (event.event === 'risk.critical') {
      // Immediate escalation needed
    } else if (event.event === 'risk.elevated') {
      // Review recommended
    }

    res.status(200).send('OK');
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      console.error('Webhook verification failed:', err.message);
      res.status(401).send('Invalid signature');
    } else {
      throw err;
    }
  }
});
```

### Webhook Options

```typescript
const event = Webhook.verify(
  payload,
  signature,
  timestamp,
  secret,
  {
    maxAgeSeconds: 300,  // Default: 5 minutes. Set to 0 to disable timestamp checking.
  }
);
```

### Testing Webhooks

Use `Webhook.sign()` to generate test signatures:

```typescript
const payload = { event: 'test.ping', /* ... */ };
const { signature, timestamp } = Webhook.sign(payload, secret);

// Use in test requests
await fetch('/webhooks/nope', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-NOPE-Signature': signature,
    'X-NOPE-Timestamp': timestamp,
  },
  body: JSON.stringify(payload),
});
```

## Risk Taxonomy

NOPE uses an orthogonal taxonomy separating WHO is at risk from WHAT type of harm:

### Subjects (who is at risk)

| Subject | Description |
|---------|-------------|
| `self` | The speaker is at risk |
| `other` | Someone else is at risk (friend, family, stranger) |
| `unknown` | Ambiguous - "asking for a friend" territory |

### Risk Types (what type of harm)

| Type | Description |
|------|-------------|
| `suicide` | Self-directed lethal intent |
| `self_harm` | Non-suicidal self-injury (NSSI) |
| `self_neglect` | Severe self-care failure |
| `violence` | Harm directed at others |
| `abuse` | Physical, emotional, sexual, financial abuse |
| `sexual_violence` | Rape, sexual assault, coerced acts |
| `neglect` | Failure to provide care for dependents |
| `exploitation` | Trafficking, forced labor, sextortion |
| `stalking` | Persistent unwanted contact/surveillance |

## Severity & Imminence

**Severity** (how serious):
| Level | Description |
|-------|-------------|
| `none` | No concern |
| `mild` | Low-level concern |
| `moderate` | Significant concern |
| `high` | Serious concern |
| `critical` | Extreme concern |

**Imminence** (how soon):
| Level | Description |
|-------|-------------|
| `not_applicable` | No time-based concern |
| `chronic` | Ongoing, long-term |
| `subacute` | Days to weeks |
| `urgent` | Hours to days |
| `emergency` | Immediate |

## API Reference

For full API documentation, see [docs.nope.net](https://docs.nope.net).

## Versioning

This SDK follows [Semantic Versioning](https://semver.org/). While in 0.x.x, breaking changes may occur in minor versions.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.

## License

MIT - see [LICENSE](LICENSE) for details.

## Support

- Documentation: [docs.nope.net](https://docs.nope.net)
- Dashboard: [dashboard.nope.net](https://dashboard.nope.net)
- Issues: [github.com/nope-net/node-sdk/issues](https://github.com/nope-net/node-sdk/issues)
