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

console.log(`Severity: ${result.summary.speaker_severity}`);  // e.g., "moderate", "high"
console.log(`Imminence: ${result.summary.speaker_imminence}`);  // e.g., "subacute", "urgent"

// Access crisis resources
for (const resource of result.crisis_resources) {
  console.log(`  ${resource.name}: ${resource.phone}`);
}
```

## Configuration

```typescript
const client = new NopeClient({
  apiKey: 'nope_live_...',           // Required for production
  baseUrl: 'https://api.nope.net',   // Optional, for self-hosted
  timeout: 30000,                     // Request timeout in milliseconds
});
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

```typescript
const result = await client.evaluate({ messages: [...], config: { user_country: 'US' } });

// Summary (speaker-focused)
result.summary.speaker_severity    // "none", "mild", "moderate", "high", "critical"
result.summary.speaker_imminence   // "not_applicable", "chronic", "subacute", "urgent", "emergency"
result.summary.any_third_party_risk  // boolean
result.summary.primary_concerns    // Narrative summary string

// Communication style
result.communication.styles        // [{ style: "direct", confidence: 0.9 }, ...]
result.communication.language      // "en"

// Individual risks (subject + type)
for (const risk of result.risks) {
  console.log(`${risk.subject} ${risk.type}: ${risk.severity} (${risk.imminence})`);
  console.log(`  Confidence: ${risk.confidence}, Subject confidence: ${risk.subject_confidence}`);
  console.log(`  Features: ${risk.features.join(', ')}`);
}

// Crisis resources (matched to user's country)
for (const resource of result.crisis_resources) {
  console.log(resource.name);
  if (resource.phone) {
    console.log(`  Phone: ${resource.phone}`);
  }
  if (resource.text_instructions) {
    console.log(`  Text: ${resource.text_instructions}`);
  }
}

// Recommended reply (if configured)
if (result.recommended_reply) {
  console.log(`Suggested response: ${result.recommended_reply.content}`);
}

// Legal/safeguarding flags
if (result.legal_flags?.ipv?.indicated) {
  console.log(`IPV detected - lethality: ${result.legal_flags.ipv.lethality_risk}`);
}
if (result.legal_flags?.mandatory_reporting?.indicated) {
  console.log(`Mandatory reporting: ${result.legal_flags.mandatory_reporting.context}`);
}
```

## Error Handling

```typescript
import {
  NopeClient,
  NopeAuthError,
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
