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
 * console.log(`Severity: ${result.speaker_severity}`);
 * if (result.resources?.primary) {
 *   console.log(`  ${result.resources.primary.name}: ${result.resources.primary.phone}`);
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
  NopeValidationError,
  NopeInsufficientBalanceError,
  NopeFeatureError,
  NopeNotFoundError,
  NopeRateLimitError,
  NopeServerError,
  NopeServiceUnavailableError,
  NopeConnectionError,
} from './errors.js';

export type {
  ApiErrorBody,
  NopeErrorOptions,
  NopeValidationErrorOptions,
  NopeInsufficientBalanceErrorOptions,
  NopeFeatureErrorOptions,
  NopeRateLimitErrorOptions,
  NopeServerErrorOptions,
} from './errors.js';

// Transport types
export type { FetchLike, SleepFn, ResponseMeta } from './http.js';
export { MAX_RETRY_WAIT_SECONDS } from './http.js';

// Version
export { SDK_VERSION } from './version.js';

// Types
export type {
  // Enums/Literals
  Severity,
  Imminence,
  RiskSubject,
  ScreenRiskSubject,
  RiskType,
  CrisisResourceType,
  CrisisResourceKind,
  CrisisResourcePriorityTier,
  HoursConfidence,
  ResourceProminence,
  // Request types
  Message,
  EvaluateConfig,
  EvaluateRequest,
  // Core response types
  EvaluateResponse,
  EvaluateMetadata,
  EvaluateResource,
  EvaluateResources,
  Risk,
  // Supporting types
  CrisisResource,
  OtherContact,
  OpenStatus,
  // Client options
  NopeClientOptions,
  EvaluateOptions,
  // Screen types
  ScreenConfig,
  ScreenOptions,
  ScreenResponse,
  ScreenRisk,
  ScreenRecommendedReply,
  ScreenCrisisResources,
  ScreenDebugInfo,
  // Resources types
  RankedResource,
  ResourcesConfig,
  ResourcesOptions,
  ResourcesResponse,
  ResourcesSmartOptions,
  ResourcesSmartResponse,
  ResourceByIdResponse,
  ResourcesCountriesResponse,
  DetectCountryResponse,
  // Signpost types (canonical aliases for Resources)
  SignpostConfig,
  SignpostOptions,
  SignpostResponse,
  SignpostSmartOptions,
  SignpostSmartResponse,
  SignpostByIdResponse,
  SignpostCountriesResponse,
  // Signpost search types
  SignpostSearchOptions,
  SignpostSearchResult,
  SignpostSearchResponse,
  // Ocular types
  OcularOptions,
  OcularResponse,
  OcularThoroughness,
  OcularAxis,
  OcularAxisGroup,
  OcularSignals,
  OcularStability,
  OcularTrajectoryEntry,
  OcularMeta,
  // Oversight types
  ConcernLevel,
  Trajectory,
  OversightSeverity,
  HumanIndicatorType,
  OversightMessage,
  OversightConversationMetadata,
  OversightConversation,
  DetectedBehavior,
  AggregatedBehavior,
  TurnAnalysis,
  HumanIndicator,
  OversightAnalysisResult,
  OversightAnalysisStrategy,
  OversightAnalyzeConfig,
  OversightAnalyzeOptions,
  OversightAnalyzeResponse,
  OversightIngestConfig,
  OversightIngestOptions,
  OversightIngestConversationResult,
  OversightIngestError,
  OversightIngestResponse,
} from './types.js';

// Utility functions and constants
export {
  SEVERITY_SCORES,
  IMMINENCE_SCORES,
  calculateSpeakerSeverity,
  calculateSpeakerImminence,
  hasThirdPartyRisk,
} from './types.js';

// Webhook verification
export {
  Webhook,
  WebhookSignatureError,
} from './webhook.js';

export type {
  WebhookEventType,
  WebhookRiskLevel,
  WebhookPayload,
  WebhookRiskSummary,
  WebhookDomainAssessment,
  WebhookFlags,
  WebhookResourceProvided,
  WebhookConversation,
  WebhookVerifyOptions,
} from './webhook.js';
