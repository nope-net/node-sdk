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
 * console.log(`Severity: ${result.global.overall_severity}`);
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
  RiskDomain,
  SelfSubtype,
  DependentSubtype,
  VictimisationSubtype,
  EvidenceGrade,
  CrisisResourceType,
  CrisisResourceKind,
  CrisisResourcePriorityTier,
  ResponseIssueSeverity,
  ResponseIssue,
  ResponseRecommendation,
  // Request types
  Message,
  EvaluateConfig,
  EvaluateRequest,
  // Response types
  EvaluateResponse,
  GlobalAssessment,
  DomainAssessment,
  BaseDomainAssessment,
  SelfDomainAssessment,
  OthersDomainAssessment,
  DependentAtRiskAssessment,
  VictimisationAssessment,
  CrisisResource,
  LegalFlags,
  ThirdPartyThreat,
  IntimatePartnerViolence,
  ChildSafeguarding,
  VulnerableAdultSafeguarding,
  AnimalCrueltyIndicator,
  PresentationModifiers,
  SafeguardingFlags,
  ProtectiveFactorsInfo,
  RecommendedReply,
  ProposedResponseEvaluation,
  CopingRecommendation,
  ResponseMetadata,
  // Client options
  NopeClientOptions,
  EvaluateOptions,
} from './types.js';
