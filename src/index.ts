/**
 * NOPE Node SDK
 *
 * Safety layer for chat & LLMs. Analyzes conversations for mental-health
 * and safeguarding risk.
 *
 * @example
 * ```typescript
 * import { NopeClient } from '@nope-net/sdk';
 *
 * const client = new NopeClient({ apiKey: 'nope_live_...' });
 * const result = await client.evaluate({
 *   messages: [{ role: 'user', content: "I'm feeling down" }],
 *   config: { user_country: 'US' }
 * });
 *
 * console.log(`Severity: ${result.summary.speaker_severity}`);
 * for (const resource of result.crisis_resources) {
 *   console.log(`  ${resource.name}: ${resource.phone}`);
 * }
 * ```
 *
 * @packageDocumentation
 */

// Client
export { NopeClient } from './client.js';

// Errors
export {
  NopeError,
  NopeAuthError,
  NopeRateLimitError,
  NopeValidationError,
  NopeServerError,
  NopeConnectionError,
} from './errors.js';

// Types
export type {
  // Enums/Literals
  Severity,
  Imminence,
  RiskSubject,
  RiskType,
  CrisisResourceType,
  CrisisResourceKind,
  CrisisResourcePriorityTier,
  // Request types
  Message,
  EvaluateConfig,
  EvaluateRequest,
  // Core response types
  EvaluateResponse,
  Risk,
  Summary,
  CommunicationAssessment,
  CommunicationStyleAssessment,
  // Supporting types
  CrisisResource,
  LegalFlags,
  IPVFlags,
  MandatoryReportingFlags,
  ThirdPartyThreatFlags,
  ProtectiveFactorsInfo,
  FilterResult,
  RecommendedReply,
  ResponseMetadata,
  // Client options
  NopeClientOptions,
  EvaluateOptions,
} from './types.js';

// Utility functions and constants
export {
  SEVERITY_SCORES,
  IMMINENCE_SCORES,
  calculateSpeakerSeverity,
  calculateSpeakerImminence,
  hasThirdPartyRisk,
} from './types.js';
