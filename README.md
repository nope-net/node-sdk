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

console.log(`Severity: ${result.global.overall_severity}`);  // e.g., "moderate", "high"
console.log(`Imminence: ${result.global.overall_imminence}`);  // e.g., "subacute", "urgent"

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
    return_assistant_reply: true,  // Include recommended safe reply
    dry_run: false,                // If true, don't log or trigger webhooks
  },
  userContext: 'User has history of anxiety',  // Optional context
});
```

## Response Structure

```typescript
const result = await client.evaluate({ messages: [...], config: { user_country: 'US' } });

// Global assessment
result.global.overall_severity    // "none", "mild", "moderate", "high", "critical"
result.global.overall_imminence   // "not_applicable", "chronic", "subacute", "urgent", "emergency"
result.global.primary_concerns    // ["suicidal ideation", "self-harm"]

// Domain-specific assessments
for (const domain of result.domains) {
  console.log(`${domain.domain}: ${domain.severity} (${domain.imminence})`);
  console.log(`  Risk features: ${domain.risk_features.join(', ')}`);
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
if (result.legal_flags?.child_safeguarding) {
  console.log(`Child safeguarding: ${result.legal_flags.child_safeguarding.urgency}`);
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
  GlobalAssessment,
  DomainAssessment,
  CrisisResource,
  Severity,
  Imminence,
} from '@nope-net/sdk';
```

## Risk Domains

NOPE classifies risk across four domains:

| Domain | Description |
|--------|-------------|
| `self` | Risk to self (suicide, self-harm, self-neglect) |
| `others` | Risk to others (violence, threats) |
| `dependent_at_risk` | Risk to dependents (child, vulnerable adult) |
| `victimisation` | Being harmed by others (IPV, trafficking, abuse) |

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

For full API documentation, see [nope.net/docs](https://nope.net/docs).

## Versioning

This SDK follows [Semantic Versioning](https://semver.org/). While in 0.x.x, breaking changes may occur in minor versions.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.

## License

MIT - see [LICENSE](LICENSE) for details.

## Support

- Documentation: [nope.net/docs](https://nope.net/docs)
- Dashboard: [dashboard.nope.net](https://dashboard.nope.net)
- Issues: [github.com/nope-net/node-sdk/issues](https://github.com/nope-net/node-sdk/issues)
