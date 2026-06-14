/**
 * NOPE SDK Types (v1 API)
 *
 * Uses orthogonal subject/type separation:
 * - WHO is at risk (subject: self | other | unknown)
 * - WHAT type of harm (type: suicide | violence | abuse | ...)
 */

// =============================================================================
// Core Enums / Literals
// =============================================================================

/**
 * Who is at risk
 *
 * - self: The speaker is at risk
 * - other: Someone else is at risk (friend, family, stranger)
 * - unknown: Ambiguous - classic "asking for a friend" territory (v0 only; v1 maps unknown → self)
 */
export type RiskSubject = 'self' | 'other' | 'unknown';

/**
 * What type of harm
 *
 * 9 harm-based types (not intermediate states or conditions):
 * - suicide: Self-directed lethal intent (C-SSRS levels derivable from features)
 * - self_harm: Non-suicidal self-injury (NSSI)
 * - self_neglect: Severe self-care failure with safeguarding concerns
 * - violence: Harm directed at others (threats, assault, homicide)
 * - abuse: Physical, emotional, sexual, financial abuse patterns
 * - sexual_violence: Rape, sexual assault, coerced sexual acts
 * - neglect: Failure to provide care for dependents
 * - exploitation: Trafficking, forced labor, sextortion, grooming
 * - stalking: Persistent unwanted contact/surveillance
 */
export type RiskType =
  | 'suicide'
  | 'self_harm'
  | 'self_neglect'
  | 'violence'
  | 'abuse'
  | 'sexual_violence'
  | 'neglect'
  | 'exploitation'
  | 'stalking';

/**
 * Communication style - how the user is expressing themselves
 *
 * Orthogonal to risk assessment - informs response style, not risk level.
 */
export type CommunicationStyle =
  | 'direct' // Explicit first-person ("I want to die")
  | 'humor' // Dark humor, memes, "lol kms"
  | 'fiction' // Creative writing, poetry, roleplay
  | 'hypothetical' // "What if someone...", philosophical
  | 'distanced' // "Asking for a friend", third-party framing
  | 'clinical' // Professional/medical language
  | 'minimized' // Hedged, softened ("not that I would, but...")
  | 'adversarial'; // Jailbreak attempts, encoded content

/** Severity scale (how bad) */
export type Severity = 'none' | 'mild' | 'moderate' | 'high' | 'critical';

/** Imminence scale (how soon) */
export type Imminence = 'not_applicable' | 'chronic' | 'subacute' | 'urgent' | 'emergency';

/** Evidence grade for legal/clinical flags */
export type EvidenceGrade = 'strong' | 'moderate' | 'weak' | 'consensus' | 'none';

/** Crisis resource type */
export type CrisisResourceType =
  | 'emergency_number'
  | 'crisis_line'
  | 'text_line'
  | 'chat_service'
  | 'support_service'
  | 'reporting_portal'
  | 'online_resource';

/** Crisis resource kind */
export type CrisisResourceKind = 'helpline' | 'reporting_portal' | 'directory' | 'self_help_site';

/** Crisis resource priority tier */
export type CrisisResourcePriorityTier =
  | 'primary_national_crisis'
  | 'secondary_national_crisis'
  | 'specialist_issue_crisis'
  | 'population_specific_crisis'
  | 'support_info_and_advocacy'
  | 'emergency_services';

/** Hours confidence level */
export type HoursConfidence = 'verified' | 'unverified' | 'approximate' | 'unknown';

/** Resource prominence level */
export type ResourceProminence = 'high' | 'medium' | 'low';

/** Other contact method for a crisis resource */
export interface OtherContact {
  /** Contact type (e.g., 'kakao', 'viber', 'signal') */
  type: string;
  /** ID, URL, or number */
  value: string;
  /** Human-readable label */
  label?: string;
}

/** Pre-computed open/closed status for a crisis resource */
export interface OpenStatus {
  /** Whether the resource is currently open. null = uncertain */
  is_open: boolean | null;
  /** ISO timestamp of next open/close transition */
  next_change?: string;
  /** How confident we are in this status */
  confidence: 'high' | 'low' | 'none';
  /** Human-readable status message */
  message?: string;
}

// =============================================================================
// Risk Structure
// =============================================================================

/**
 * A single identified risk
 *
 * Each risk represents one subject + type combination with its assessment.
 * A conversation can have multiple risks (e.g., IPV victim with suicidal ideation).
 */
export interface Risk {
  /** Who is at risk */
  subject: RiskSubject;

  /**
   * Confidence in subject determination (0.0-1.0)
   *
   * Low values indicate ambiguity:
   * - 0.9+ = Clear ("I want to kill myself" → self)
   * - 0.5-0.7 = Moderate ("Asking for a friend" → likely self, but uncertain)
   * - <0.5 = Very uncertain
   */
  subject_confidence: number;

  /** What type of harm */
  type: RiskType;

  /** How severe (none → critical) */
  severity: Severity;

  /** How soon (not_applicable → emergency) */
  imminence: Imminence;

  /** Confidence in this risk assessment (0.0-1.0) */
  confidence: number;

  /** Evidence features supporting this risk */
  features: string[];
}

// =============================================================================
// Communication Structure
// =============================================================================

/** Communication style with confidence */
export interface CommunicationStyleAssessment {
  style: CommunicationStyle;
  confidence: number;
}

/** Communication analysis */
export interface CommunicationAssessment {
  /** Detected communication styles (may have multiple) */
  styles: CommunicationStyleAssessment[];

  /** Detected language (ISO 639-1) */
  language: string;

  /** Detected locale (e.g., 'en-US') */
  locale?: string;
}

// =============================================================================
// Summary Structure
// =============================================================================

/**
 * Quick summary derived from risks array
 *
 * speaker_severity/imminence are calculated from risks where subject='self'
 * and subject_confidence > 0.5. This ensures bystanders don't get
 * crisis-level responses for third-party concerns.
 */
export interface Summary {
  /** Max severity from risks where subject='self' and confidence > 0.5 */
  speaker_severity: Severity;

  /** Max imminence from risks where subject='self' and confidence > 0.5 */
  speaker_imminence: Imminence;

  /** Whether any risk has subject='other' */
  any_third_party_risk: boolean;

  /** Narrative summary of key findings */
  primary_concerns: string;
}

// =============================================================================
// Legal Flags
// =============================================================================

/**
 * IPV-specific flags
 *
 * Based on DASH (UK) and Danger Assessment (Johns Hopkins).
 * Strangulation is the single strongest predictor of homicide in IPV.
 */
export interface IPVFlags {
  /** IPV indicators present */
  indicated: boolean;

  /** ANY history of strangulation/choking (750x homicide risk) */
  strangulation: boolean;

  /** Overall lethality risk */
  lethality_risk: 'standard' | 'elevated' | 'severe' | 'extreme';

  /** Escalation pattern detected */
  escalation_pattern?: boolean;

  /** Confidence in assessment */
  confidence?: number;
}

/**
 * Safeguarding concern flags
 *
 * Indicates patterns that may trigger statutory obligations depending on
 * jurisdiction and the platform's role. NOPE flags concerns; humans determine
 * whether mandatory reporting applies based on local law and organizational policy.
 *
 * Note: AI systems are not mandatory reporters under any current statute.
 * This flag surfaces patterns for human review, not legal determinations.
 */
export interface SafeguardingConcernFlags {
  /** Safeguarding concern indicators present */
  indicated: boolean;

  /** Context triggering the concern */
  context: 'minor_involved' | 'vulnerable_adult' | 'csa' | 'infant_at_risk' | 'elder_abuse';
}

/** Third-party threat flags (Tarasoff-style duty to warn) */
export interface ThirdPartyThreatFlags {
  /** Tarasoff duty potentially triggered */
  tarasoff_duty: boolean;

  /** Specific identifiable target */
  specific_target: boolean;

  /** Confidence in assessment */
  confidence?: number;
}

/**
 * Stalking flags
 *
 * Based on SAM (Stalking Assessment & Management) framework.
 * Ex-intimate partner stalking has significantly elevated homicide risk.
 */
export interface StalkingFlags {
  /** Former intimate partner (highest risk per SAM) */
  ex_intimate_partner: boolean;

  /** Escalation in frequency/severity detected */
  escalation_detected: boolean;

  /** History of violence toward victim */
  violence_history: boolean;

  /** Victim expresses fear for safety (predictive per SAM) */
  victim_fear_expressed: boolean;

  /**
   * Risk level derived from SAM domains:
   * - severe: violence_history + escalation, OR prior violence + victim fears for life
   * - elevated: ex_intimate_partner, OR escalation + victim_fear
   * - standard: Basic stalking pattern without amplifiers
   */
  risk_level: 'standard' | 'elevated' | 'severe';
}

/**
 * Legal/safety flags
 *
 * Derived from risks + features but surfaced separately for easy consumption.
 */
export interface LegalFlags {
  /** Intimate partner violence indicators */
  ipv?: IPVFlags;

  /** Safeguarding concern indicators (patterns that may trigger statutory review) */
  safeguarding_concern?: SafeguardingConcernFlags;

  /** Third-party threat indicators */
  third_party_threat?: ThirdPartyThreatFlags;

  /** Stalking indicators (SAM-based) */
  stalking?: StalkingFlags;
}

// =============================================================================
// Protective Factors
// =============================================================================

/** Protective factors */
export interface ProtectiveFactorsInfo {
  /** Specific protective factors present */
  protective_factors?: string[];

  /** Overall strength assessment */
  protective_factor_strength?: 'weak' | 'moderate' | 'strong';
}

// =============================================================================
// Filter Result
// =============================================================================

/** Filter stage results */
export interface FilterResult {
  /** Triage level */
  triage_level: 'none' | 'concern';

  /** Preliminary risks detected (lightweight) */
  preliminary_risks: Array<{
    subject: RiskSubject;
    type: RiskType;
    confidence: number;
  }>;

  /** Reason for triage decision */
  reason: string;
}

// =============================================================================
// Crisis Resources
// =============================================================================

/** A crisis resource (helpline, text line, etc.) */
export interface CrisisResource {
  /** Contact modality (how to reach them) */
  type: CrisisResourceType;
  /** Name of the resource/organization */
  name: string;
  /** Native script name (e.g., いのちの電話) for non-English resources */
  name_local?: string;
  /** Phone number */
  phone?: string;
  /** Text instructions (e.g., 'Text HOME to 741741') - human readable fallback */
  text_instructions?: string;
  /** SMS number for sms: links (e.g., '741741') */
  sms_number?: string;
  /** SMS body/keyword for sms: links (e.g., 'HOME') */
  sms_body?: string;
  /** Chat URL */
  chat_url?: string;
  /** WhatsApp deep link (e.g., 'https://wa.me/18002738255') */
  whatsapp_url?: string;
  /** Email address */
  email?: string;
  /** WeChat ID (China) */
  wechat_id?: string;
  /** LINE deep link (Japan/Thailand/Taiwan) */
  line_url?: string;
  /** Telegram deep link */
  telegram_url?: string;
  /** Other contact methods not covered above */
  other_contacts?: OtherContact[];
  /** Website URL */
  website_url?: string;
  /** Human-readable availability (e.g., '24/7', 'Mon-Fri 9am-5pm') */
  availability?: string;
  /** Machine-readable 24/7 flag */
  is_24_7?: boolean;
  /** IANA timezone identifier (e.g., 'America/New_York') */
  timezone?: string;
  /** OpenStreetMap opening_hours format (e.g., 'Mo-Fr 09:00-17:00') */
  opening_hours_osm?: string;
  /** Confidence level in hours data */
  hours_confidence?: HoursConfidence;
  /** Pre-computed open/closed status */
  open_status?: OpenStatus;
  /** Languages supported (ISO codes) */
  languages?: string[];
  /** Description of the service */
  description?: string;
  /** What the resource IS (helpline vs reporting portal vs directory) */
  resource_kind?: CrisisResourceKind;
  /** Issues this resource handles (aligned with classification taxonomy) */
  service_scope?: string[];
  /** Populations this resource serves */
  population_served?: string[];
  /** Semantic priority for display and routing */
  priority_tier?: CrisisResourcePriorityTier;
  /** Freeform tags for filtering/display */
  tags?: string[];
  /** How well-known/established the resource is */
  prominence?: ResourceProminence;
  /** Source of this resource */
  source?: 'database' | 'web_search';
}

// =============================================================================
// Request Types
// =============================================================================

/** A message in the conversation */
export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string; // ISO 8601
}

/** Configuration for evaluation request */
export interface EvaluateConfig {
  /** Country for crisis resources (ISO country code, e.g., 'US', 'GB') */
  country?: string;

  /**
   * @deprecated Use `country` instead. This field is silently ignored by the v1 API.
   * Kept for backwards compatibility with v1/try/evaluate which accepts this name.
   */
  user_country?: string;

  /** @deprecated v0-only. Ignored by the v1 Edge-backed endpoint. */
  locale?: string;

  /** @deprecated v0-only. Ignored by the v1 Edge-backed endpoint. */
  user_age_band?: 'adult' | 'minor' | 'unknown';

  /** @deprecated v0-only. Ignored by the v1 Edge-backed endpoint. */
  policy_id?: string;

  /** Include crisis resources in response. Default: true */
  include_resources?: boolean;

  /** @deprecated v0-only. Ignored by the v1 Edge-backed endpoint. */
  return_assistant_reply?: boolean;

  /** @deprecated v0-only. Ignored by the v1 Edge-backed endpoint. */
  assistant_safety_mode?: 'template' | 'generate';

  /** @deprecated v0-only. Ignored by the v1 Edge-backed endpoint. */
  use_multiple_judges?: boolean;

  /** @deprecated v0-only. Ignored by the v1 Edge-backed endpoint. */
  models?: string[];

  /** Customer-provided conversation ID for webhook correlation */
  conversation_id?: string;

  /** Customer-provided end-user ID for webhook correlation */
  end_user_id?: string;
}

/** Request to /v1/evaluate endpoint */
export interface EvaluateRequest {
  /** Conversation messages. Either messages OR text must be provided */
  messages?: Message[];

  /** Plain text input. Either messages OR text must be provided */
  text?: string;

  /** Configuration options */
  config: EvaluateConfig;

  /** Free-text user context to help shape responses */
  user_context?: string;
}

// =============================================================================
// Response Types
// =============================================================================

/** Recommended reply content */
export interface RecommendedReply {
  content: string;
  source: 'template' | 'llm_generated';
  notes?: string;
}

/** Metadata about the request/response */
export interface ResponseMetadata {
  access_level?: 'unauthenticated' | 'authenticated' | 'admin';
  is_admin?: boolean;
  messages_truncated?: boolean;
  input_format?: 'structured' | 'text_blob';
  api_version: 'v1';
  /** True if request came via /v1/try/* endpoints */
  try_endpoint?: boolean;
}

/**
 * Response from /v1/evaluate endpoint
 *
 * Note: The v1 API now uses Edge-backed classification with a simplified response.
 * Some fields from legacy v0 responses may not be present.
 */
export interface EvaluateResponse {
  /** Unique request ID for audit trail correlation */
  request_id: string;

  /** ISO 8601 timestamp for audit trail */
  timestamp: string;

  /** Identified risks (the core of v1) */
  risks: Risk[];

  // === v1 Edge-backed response fields ===

  /** Chain-of-thought reasoning from Edge model (v1 only) */
  rationale?: string;

  /** Max severity for speaker (subject='self'). Top-level in v1, nested in summary for v0 */
  speaker_severity?: Severity;

  /** Max imminence for speaker (subject='self'). Top-level in v1, nested in summary for v0 */
  speaker_imminence?: Imminence;

  /** Whether to show crisis resources (v1 only) */
  show_resources?: boolean;

  /** Crisis resources with 'why' explanations (v1 format). Contains primary and secondary keys */
  resources?: {
    primary?: CrisisResource & { why: string };
    secondary?: Array<CrisisResource & { why: string }>;
  };

  // === Legacy v0 response fields (may not be present in v1) ===

  /** Communication style analysis (v0 only) */
  communication?: CommunicationAssessment;

  /** Quick summary derived from risks (v0 only, use speaker_severity/speaker_imminence for v1) */
  summary?: Summary;

  /** Legal/safety flags (v0 only) */
  legal_flags?: LegalFlags;

  /** Protective factors (v0 only) */
  protective_factors?: ProtectiveFactorsInfo;

  /** Overall confidence in assessment (v0 only) */
  confidence?: number;

  /** Judge agreement if multiple judges used (v0 only) */
  agreement?: number;

  /** Crisis resources for user's region (v0 format) */
  crisis_resources?: CrisisResource[];

  /** Pre-built widget URL (only when speaker_severity > 'none') */
  widget_url?: string;

  /** Recommended reply content */
  recommended_reply?: RecommendedReply;

  /** LLM-generated query for resource matching */
  resource_query?: string;

  /** LLM-generated tags for specialized resources */
  resource_tags?: string[];

  /** LLM reflection/reasoning (v0 only, use rationale for v1) */
  reflection?: string;

  /** Filter stage results (v0 only) */
  filter_result?: FilterResult;

  /** Metadata about the request/response */
  metadata?: ResponseMetadata;
}

// =============================================================================
// Client Options
// =============================================================================

/** Options for creating a NopeClient */
export interface NopeClientOptions {
  /**
   * Your NOPE API key (starts with 'nope_live_' or 'nope_test_').
   * Can be undefined for local development/testing without auth.
   */
  apiKey?: string;

  /** Override the API base URL. Defaults to https://api.nope.net */
  baseUrl?: string;

  /** Request timeout in milliseconds. Defaults to 30000 (30 seconds) */
  timeout?: number;

  /**
   * Use demo/try endpoints that don't require authentication.
   * These are rate-limited but useful for testing and evaluation.
   * When true, uses /v1/try/evaluate instead of /v1/evaluate.
   * Note: screen() is not available in demo mode — use evaluate() instead.
   */
  demo?: boolean;
}

/** Options for the evaluate method */
export interface EvaluateOptions {
  /** Conversation messages. Either messages OR text must be provided */
  messages?: Message[];

  /** Plain text input. Either messages OR text must be provided */
  text?: string;

  /** Configuration options */
  config?: EvaluateConfig;

  /** Free-text user context to help shape responses */
  userContext?: string;
}

// =============================================================================
// Screen Types (for legacy /v0/screen endpoint — use evaluate() instead)
// =============================================================================

/** @deprecated Use evaluate() and Risk instead. Screen types are for the legacy /v0/screen endpoint. */
export interface ScreenRisk {
  /** What type of harm */
  type: RiskType;

  /** Who is at risk */
  subject: RiskSubject;

  /** How severe */
  severity: Severity;

  /** How soon */
  imminence: Imminence;

  /** Confidence in this risk assessment (0.0-1.0) */
  confidence: number;
}

/** Recommended supportive reply for screen response */
export interface ScreenRecommendedReply {
  /** The recommended reply content */
  content: string;

  /** Source of the reply (always 'llm_generated') */
  source: 'llm_generated';
}

/** Primary crisis resource (e.g., 988 Lifeline) */
export interface ScreenCrisisResourcePrimary {
  name: string;
  description: string;
  phone: string;
  text: string;
  chat_url: string;
  website_url: string;
  availability: string;
  languages: string[];
}

/** Secondary crisis resource (e.g., Crisis Text Line) */
export interface ScreenCrisisResourceSecondary {
  name: string;
  description: string;
  text: string;
  sms_number: string;
  chat_url: string;
  website_url: string;
  availability: string;
  languages: string[];
}

/** @deprecated Crisis resources returned by legacy /v0/screen endpoint */
export interface ScreenCrisisResources {
  primary: ScreenCrisisResourcePrimary;
  secondary: ScreenCrisisResourceSecondary[];
}

/** Suggested display text for crisis resources */
export interface ScreenDisplayText {
  /** Short message (e.g., "If you're in crisis, call or text 988") */
  short: string;
  /** Detailed message with more context */
  detailed: string;
}

/** @deprecated Debug information for legacy /v0/screen (only if requested) */
export interface ScreenDebugInfo {
  model: string;
  latency_ms: number;
  raw_response?: string;
}

/** @deprecated Use evaluate() instead. Screen types are for the legacy /v0/screen endpoint. */
export interface ScreenConfig {
  /** ISO country code for locale-specific resources (default: 'US') */
  country?: string;

  /** Include debug info (latency, raw response) */
  debug?: boolean;

  /** Generate a recommended supportive reply (additional ~$0.0005 cost) */
  include_recommended_reply?: boolean;
}

/** Options for the screen method */
export interface ScreenOptions {
  /** Conversation messages. Either messages OR text must be provided */
  messages?: Message[];

  /** Plain text input. Either messages OR text must be provided */
  text?: string;

  /** Configuration options */
  config?: ScreenConfig;
}

/**
 * @deprecated Use evaluate() and EvaluateResponse instead.
 * Response from legacy /v0/screen endpoint.
 */
export interface ScreenResponse {
  /** Detected risks with type, subject, severity, imminence */
  risks: ScreenRisk[];

  /** Should crisis resources be shown? Derived from risks[] severity */
  show_resources: boolean;

  /** Suicidal ideation detected. Derived from risks where type='suicide' */
  suicidal_ideation: boolean;

  /** Self-harm (NSSI) detected. Derived from risks where type='self_harm' */
  self_harm: boolean;

  /** Brief rationale for assessment */
  rationale: string;

  /** Crisis resources to display (only when show_resources is true) */
  resources?: ScreenCrisisResources;

  /** Request ID for audit trail */
  request_id: string;

  /** ISO timestamp for audit trail */
  timestamp: string;

  /** Debug info (only if requested) */
  debug?: ScreenDebugInfo;

  /** Recommended supportive reply (only when requested + risks detected) */
  recommended_reply?: ScreenRecommendedReply;
}

// =============================================================================
// Utility Functions
// =============================================================================

/** Numeric mappings for severity comparison */
export const SEVERITY_SCORES: Record<Severity, number> = {
  none: 0,
  mild: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

/** Numeric mappings for imminence comparison */
export const IMMINENCE_SCORES: Record<Imminence, number> = {
  not_applicable: 0,
  chronic: 1,
  subacute: 2,
  urgent: 3,
  emergency: 4,
};

/**
 * Calculate speaker severity from risks array
 *
 * Only considers risks where subject='self'.
 * For v0 responses with subject_confidence, filters to confidence > 0.5.
 * For v1 responses (no subject_confidence), all self-risks are included.
 */
export function calculateSpeakerSeverity(risks: Risk[]): Severity {
  const speakerRisks = risks.filter(
    (r) => r.subject === 'self' && (r.subject_confidence ?? 1.0) > 0.5
  );

  if (speakerRisks.length === 0) {
    return 'none';
  }

  const maxScore = Math.max(...speakerRisks.map((r) => SEVERITY_SCORES[r.severity]));

  const entries = Object.entries(SEVERITY_SCORES) as [Severity, number][];
  const match = entries.find(([, score]) => score === maxScore);
  return match ? match[0] : 'none';
}

/**
 * Calculate speaker imminence from risks array
 *
 * For v1 responses (no subject_confidence), all self-risks are included.
 */
export function calculateSpeakerImminence(risks: Risk[]): Imminence {
  const speakerRisks = risks.filter(
    (r) => r.subject === 'self' && (r.subject_confidence ?? 1.0) > 0.5
  );

  if (speakerRisks.length === 0) {
    return 'not_applicable';
  }

  const maxScore = Math.max(...speakerRisks.map((r) => IMMINENCE_SCORES[r.imminence]));

  const entries = Object.entries(IMMINENCE_SCORES) as [Imminence, number][];
  const match = entries.find(([, score]) => score === maxScore);
  return match ? match[0] : 'not_applicable';
}

/**
 * Check if any third-party risk exists
 *
 * For v1 responses (no subject_confidence), all other-risks are included.
 */
export function hasThirdPartyRisk(risks: Risk[]): boolean {
  return risks.some((r) => r.subject === 'other' && (r.subject_confidence ?? 1.0) > 0.5);
}

// =============================================================================
// Resources Types (for /v1/resources/* endpoints)
// =============================================================================

/** A resource with LLM-computed relevance ranking */
export interface RankedResource {
  /** The crisis resource */
  resource: CrisisResource;

  /** Brief explanation of why this resource is relevant (1-2 sentences) */
  why: string;

  /** Rank position (1 = most relevant) */
  rank: number;
}

/** Configuration for resources request */
export interface ResourcesConfig {
  /** Service scopes to filter by (e.g., 'suicide_prevention', 'domestic_violence') */
  scopes?: string[];

  /** Populations to filter by (e.g., 'youth', 'veterans', 'lgbtq') */
  populations?: string[];

  /** Maximum number of resources to return (max 10) */
  limit?: number;

  /** Only return 24/7 urgent resources */
  urgent?: boolean;
}

/** Options for the resources method */
export interface ResourcesOptions {
  /** ISO country code (e.g., "US", "GB") */
  country: string;

  /** Optional filtering configuration */
  config?: ResourcesConfig;
}

/** Response from GET /v1/resources endpoint */
export interface ResourcesResponse {
  /** Country code (ISO 3166-1 alpha-2) */
  country: string;

  /** List of crisis resources */
  resources: CrisisResource[];

  /** Number of resources returned */
  count: number;

  /** Primary resources matching requested scopes (when scopes provided) */
  primary?: CrisisResource[];

  /** Secondary general resources (when scopes provided) */
  secondary?: CrisisResource[];

  /** Scopes that were requested (when provided) */
  scopes_requested?: string[];
}

/** Options for the resources_smart method */
export interface ResourcesSmartOptions {
  /** ISO country code (e.g., "US", "GB") */
  country: string;

  /** Natural language query (max 500 chars) */
  query: string;

  /** Optional filtering configuration */
  config?: ResourcesConfig;
}

/** Response from GET /v1/resources/smart endpoint */
export interface ResourcesSmartResponse {
  /** Country code (ISO 3166-1 alpha-2) */
  country: string;

  /** The search query used */
  query: string;

  /** Resources ranked by relevance to query */
  ranked: RankedResource[];

  /** Number of resources returned */
  count: number;

  /** Scopes that were requested (when provided) */
  scopes_requested?: string[];
}

/** Response from GET /v1/resources/:id endpoint */
export interface ResourceByIdResponse {
  /** The requested crisis resource */
  resource: CrisisResource;
}

/** Response from GET /v1/resources/countries endpoint */
export interface ResourcesCountriesResponse {
  /** List of supported country codes (ISO 3166-1 alpha-2) */
  countries: string[];

  /** Number of countries */
  count: number;
}

/** Response from GET /v1/resources/detect-country endpoint */
export interface DetectCountryResponse {
  /** Detected country code (ISO 3166-1 alpha-2), or empty string if not detected */
  country_code: string;

  /** Human-readable country name, or empty string if not detected */
  country_name: string;

  /** Error message if country could not be detected */
  error?: string;
}

// =============================================================================
// Signpost Types (aliases for Resources - canonical naming)
// =============================================================================

/** @see ResourcesConfig */
export type SignpostConfig = ResourcesConfig;

/** @see ResourcesOptions */
export type SignpostOptions = ResourcesOptions;

/** @see ResourcesResponse */
export type SignpostResponse = ResourcesResponse;

/** @see ResourcesSmartOptions */
export type SignpostSmartOptions = ResourcesSmartOptions;

/** @see ResourcesSmartResponse */
export type SignpostSmartResponse = ResourcesSmartResponse;

/** @see ResourceByIdResponse */
export type SignpostByIdResponse = ResourceByIdResponse;

/** @see ResourcesCountriesResponse */
export type SignpostCountriesResponse = ResourcesCountriesResponse;

// =============================================================================
// Signpost Search Types (vector semantic search — GET /v1/signpost/search)
// =============================================================================

/** Options for the signpostSearch method. */
export interface SignpostSearchOptions {
  /** Natural language search query (max 500 chars). */
  query: string;

  /** Optional ISO 3166-1 alpha-2 country code to filter results. */
  country?: string;

  /** Maximum number of results (default: 10, max: 50). */
  limit?: number;

  /** Similarity threshold in [0, 1] (default: 0.3). Higher = stricter. */
  threshold?: number;
}

/**
 * A single semantic-search hit.
 *
 * Carries all the flattened {@link CrisisResource} fields (the gateway lifts
 * contact methods to the top level and computes `open_status`) plus the
 * vector `similarity` score for this query.
 */
export interface SignpostSearchResult extends CrisisResource {
  /** Vector similarity to the query in [0, 1]; higher = more relevant. */
  similarity?: number;
}

/** Response from GET /v1/signpost/search endpoint. */
export interface SignpostSearchResponse {
  /** The search query that was run. */
  query: string;

  /** Country filter applied, or null when unfiltered. */
  country: string | null;

  /** Resources ranked by semantic similarity to the query. */
  results: SignpostSearchResult[];

  /** Number of results returned. */
  count: number;

  /** Timing breakdown for the search. */
  timing: {
    /** Time spent embedding the query (ms). */
    embed_ms: number;
    /** Time spent on the vector search (ms). */
    search_ms: number;
    /** Total time (embed + search) (ms). */
    total_ms: number;
  };
}

// =============================================================================
// Oversight Types (for /v1/oversight/* endpoints)
// =============================================================================

/**
 * Concern level for AI behavior analysis
 *
 * - none: No concerning behaviors detected
 * - low: Minor issues, likely benign
 * - medium: Behaviors worth noting, may need review
 * - high: Significant concerns requiring attention
 * - critical: Severe behaviors requiring immediate action
 */
export type ConcernLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

/**
 * Trajectory of concern within a conversation
 *
 * - improving: Concern level decreasing over time
 * - stable: Concern level consistent
 * - worsening: Concern level increasing over time
 */
export type Trajectory = 'improving' | 'stable' | 'worsening';

/**
 * Behavior severity in Oversight analysis
 *
 * - low: Minor concern
 * - medium: Moderate concern
 * - high: Significant concern
 * - critical: Severe concern
 */
export type OversightSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Human indicator types observed in conversation
 */
export type HumanIndicatorType =
  | 'distress_markers'
  | 'acquiescence'
  | 'disengagement'
  | 'escalation'
  | 'pushback';

/**
 * A message in an Oversight conversation
 */
export interface OversightMessage {
  /** Message role */
  role: 'user' | 'assistant' | 'system';

  /** Message content */
  content: string;

  /** Customer-provided unique identifier for this message/turn */
  message_id?: string;

  /** When this message was sent (ISO 8601) */
  timestamp?: string;

  /** Agent/bot identifier that generated this message (for assistant messages) */
  agent_id?: string;

  /** Agent version string */
  agent_version?: string;

  /** Retrieved RAG/memory context that informed this response */
  context?: string;
}

/**
 * Metadata about an Oversight conversation
 */
export interface OversightConversationMetadata {
  /** Hashed identifier for the end-user (for cross-session trajectory tracking) */
  user_id_hash?: string;

  /** Customer's session identifier */
  session_id?: string;

  /** Session number for this user (1, 2, 3...) */
  session_number?: number;

  /** Whether the end-user is a minor (escalates all severity levels) */
  user_is_minor?: boolean;

  /** Age bracket of the end-user */
  user_age_bracket?: 'child' | 'teen' | 'adult' | 'unknown';

  /** Platform where conversation occurred (e.g., "ios", "web", "discord") */
  platform?: string;

  /** Product/bot name */
  product?: string;

  /** When the conversation started (ISO 8601) */
  started_at?: string;

  /** When the conversation ended (ISO 8601) */
  ended_at?: string;

  /** Customer-defined tags for categorization */
  tags?: string[];

  /** Additional fields are preserved but not indexed */
  [key: string]: unknown;
}

/**
 * A conversation to analyze with Oversight
 */
export interface OversightConversation {
  /** Unique identifier for the conversation */
  conversation_id?: string;

  /** Messages in the conversation */
  messages: OversightMessage[];

  /** Optional metadata about the conversation */
  metadata?: OversightConversationMetadata;
}

/**
 * A detected behavior in the conversation
 */
export interface DetectedBehavior {
  /** Behavior code (e.g., 'validation_of_suicidal_ideation', 'romantic_escalation') */
  code: string;

  /** Severity of this behavior instance */
  severity: OversightSeverity;

  /** Turn number where behavior was detected (0-indexed) */
  turn_number: number;

  /** Evidence quote from the conversation */
  evidence: string;

  /** Reasoning for why this behavior was flagged */
  reasoning: string;
}

/**
 * Aggregated behavior for summary (multiple instances collapsed)
 */
export interface AggregatedBehavior {
  /** Behavior code */
  code: string;

  /** Highest severity across instances */
  severity: OversightSeverity;

  /** Number of turns where this behavior appeared */
  turn_count: number;
}

/**
 * Turn-level analysis
 */
export interface TurnAnalysis {
  /** Turn number (0-indexed) */
  turn_number: number;

  /** Role of this turn (always 'assistant' for analysis) */
  role: 'assistant';

  /** Brief summary of turn content */
  content_summary: string;

  /** Behaviors detected in this turn */
  behaviors: DetectedBehavior[];

  /** Whether AI missed an opportunity to intervene */
  missed_intervention: boolean;
}

/**
 * Human response indicator
 */
export interface HumanIndicator {
  /** Type of indicator */
  type: HumanIndicatorType;

  /** What was observed */
  observation: string;

  /** Turn numbers where this was observed */
  turns: number[];
}

/**
 * Result from Oversight analysis
 */
export interface OversightAnalysisResult {
  /** Conversation identifier */
  conversation_id: string;

  /** When analysis was performed (ISO 8601) */
  analyzed_at: string;

  /** Brief summary of the conversation */
  conversation_summary: string;

  /** Overall concern level */
  overall_concern: ConcernLevel;

  /** Trajectory of concern within the conversation */
  trajectory: Trajectory;

  /** Human-readable summary of findings */
  summary: string;

  /** Turn-by-turn analysis (assistant turns only) */
  turn_analysis: TurnAnalysis[];

  /** Human response indicators observed */
  human_indicators: HumanIndicator[];

  /** Pattern assessment narrative */
  pattern_assessment: string;

  /** Aggregated behaviors (deduplicated across turns) */
  detected_behaviors: AggregatedBehavior[];

  /** Model used for analysis */
  model_used: string;

  /** Analysis latency in milliseconds */
  latency_ms?: number;

  /** Prompt tokens used */
  prompt_tokens?: number;

  /** Completion tokens used */
  completion_tokens?: number;

  /** Raw XML output (only if requested) */
  raw_xml?: string;
}

/**
 * Analysis strategy
 *
 * - single: Single-pass analysis (fast, may lose context on long conversations)
 * - sliding: Sliding window analysis (better for long conversations)
 */
export type OversightAnalysisStrategy = 'single' | 'sliding';

/**
 * Configuration for Oversight analyze request
 */
export interface OversightAnalyzeConfig {
  /**
   * Force a specific analysis strategy.
   * If undefined, auto-selects based on conversation length.
   */
  strategy?: OversightAnalysisStrategy;

  /** Include raw XML in response (for debugging) */
  include_raw_xml?: boolean;

  /** Custom model to use */
  model?: string;
}

/**
 * Options for the oversight.analyze method
 */
export interface OversightAnalyzeOptions {
  /** Conversation to analyze */
  conversation: OversightConversation;

  /** Configuration options */
  config?: OversightAnalyzeConfig;
}

/**
 * Response from /v1/oversight/analyze
 */
export interface OversightAnalyzeResponse {
  /** Analysis result */
  result: OversightAnalysisResult;

  /** Which strategy was used */
  strategy: OversightAnalysisStrategy;

  /** Why this strategy was chosen */
  strategy_reason: string;
}

/**
 * Configuration for Oversight ingest request
 */
export interface OversightIngestConfig {
  /** Custom model to use */
  model?: string;
}

/**
 * Options for the oversight.ingest method
 */
export interface OversightIngestOptions {
  /** Conversations to analyze (max 100) */
  conversations: Array<OversightConversation & { conversation_id: string }>;

  /** Webhook URL to notify when ingestion completes */
  webhook_url?: string;

  /** Configuration options */
  config?: OversightIngestConfig;
}

/**
 * Per-conversation result from ingest
 */
export interface OversightIngestConversationResult {
  /** Conversation ID */
  conversation_id: string;

  /** Overall concern level */
  overall_concern: ConcernLevel;

  /** Number of behaviors detected */
  behaviors_detected: number;

  /** Truncation warnings if conversation was modified */
  truncation_warnings?: Array<{
    type: string;
    message: string;
  }>;
}

/**
 * Per-conversation error from ingest
 */
export interface OversightIngestError {
  /** Conversation ID */
  conversation_id: string;

  /** Error message */
  error: string;
}

/**
 * Response from /v1/oversight/ingest
 */
export interface OversightIngestResponse {
  /** Unique ingestion ID for tracking */
  ingestion_id: string;

  /** Current status */
  status: 'queued' | 'processing' | 'complete' | 'failed';

  /** Number of conversations received */
  conversations_received: number;

  /** Number of conversations successfully processed */
  conversations_processed: number;

  /** Estimated completion time (ISO 8601) */
  estimated_completion?: string;

  /** URL to view results in dashboard */
  dashboard_url: string;

  /** Per-conversation results (if complete) */
  results?: OversightIngestConversationResult[];

  /** Per-conversation errors (if any) */
  errors?: OversightIngestError[];
}

// ============================================================================
// Ocular (behavioral risk assessment — POST /v1/ocular)
// ============================================================================

// =============================================================================
// Ocular (behavioral risk assessment — /v1/ocular)
// =============================================================================
//
// The customer-facing /v1/ocular response models the post-filter surface the
// gateway emits. Individual head-code identifiers are stripped by the gateway
// and are not part of the SDK surface.

export type OcularThoroughness = 'fast' | 'auto' | 'thorough';

/**
 * Options for client.ocular(). Either `messages` or `text` is required.
 */
export interface OcularOptions {
  /** Conversation messages. */
  messages?: Message[];
  /** Plain text input (alternative to messages). */
  text?: string;
  /**
   * How many ensemble variants to run. `'fast'` is single-variant (lowest
   * latency), `'thorough'` populates `stability`. Omit for the server default.
   */
  thoroughness?: OcularThoroughness;
}

/** Per-axis output — level enum + raw score in [0, 1]. */
export interface OcularAxis {
  /** One of: minimal | low | moderate | high | critical (imminence may also
   *  return `not_applicable`). Open string for forward compatibility. */
  level: string;
  /** Raw probability in [0, 1]. */
  score: number;
}

export type OcularAxisGroup = Record<string, OcularAxis>;

/**
 * Per-axis signal groups.
 *
 * `user` carries 8 axes: suicide, self_harm, harm_to_others, abuse,
 * sexual_violence, exploitation, stalking, self_neglect.
 *
 * `ai` carries 4 axes when assistant turns are present: harm_provision,
 * emotional_failure, manipulation, safeguarding_failure.
 */
export interface OcularSignals {
  user: OcularAxisGroup;
  ai: OcularAxisGroup;
}

/**
 * Per-axis stability in [0, 1] across the variants Ocular ran (higher = more
 * confident). Returned only when the call was multi-variant; otherwise the
 * response carries `stability: null`.
 */
export interface OcularStability {
  user: Record<string, number>;
  ai: Record<string, number>;
  imminence: number;
}

/**
 * Per-turn trajectory entry — minimal surface, no head codes.
 *
 * `salience` is the same continuous score as the top-level field, computed
 * per turn so callers can plot the conversation arc.
 */
export interface OcularTrajectoryEntry {
  role: string;
  turn: number;
  salience: number;
}

/** Response metadata. */
export interface OcularMeta {
  /** Ocular model build identifier. */
  version: string;
  /** Upstream Ocular inference time (ms). */
  inference_ms: number;
  /** Present only when the input was windowed at the gateway. */
  windowed?: boolean;
  /** Number of windows the input was split into. */
  windows?: number;
  /** True if any window's content was truncated to fit. */
  truncated?: boolean;
  [key: string]: unknown;
}

/**
 * Response from POST /v1/ocular.
 *
 * Customer code keys decisions off the continuous `salience` score in
 * [0, 1] plus the structural axes under `signals.user.*` (8 axes) and
 * `signals.ai.*` (4 axes). Pick the threshold that fits your downstream
 * action; published guidance uses T_WATCH=0.30 and T_DANGER=0.60 as
 * reference cutoffs (see docs.nope.net/ocular/risk-interpretation).
 *
 * `subject` ('self' / 'other' / 'unknown') identifies who the speaker-side
 * risk pertains to; `imminence` is a separate axis. `fiction` and
 * `authenticity` are context modulators already factored into `salience`
 * and per-axis levels server-side — surface them for inspection, not for
 * re-aggregation.
 *
 * `stability` is only populated when Ocular produced multiple variants on
 * the call. `trajectory` is present when the input had ≥2 turns; each
 * entry carries the per-turn salience for plotting.
 */
export interface OcularResponse {
  /** Continuous severity score in [0, 1]. The customer decision contract. */
  salience: number;
  /** Who the speaker-side risk pertains to. */
  subject: string;
  /** How urgent the concern is (separate axis, not part of `signals`). */
  imminence: OcularAxis;
  /** Roleplay/fiction-framing strength in [0, 1] (informational). */
  fiction: number;
  /** Authenticity-of-distress signal in [0, 1] (informational). */
  authenticity: number;
  /** 8 user-risk axes + 4 AI-behavior axes, each with level + score. */
  signals: OcularSignals;
  /** Which ensemble depth the call ran at. */
  thoroughness: OcularThoroughness;
  /** Aggregate confidence in [0, 1] across the variants produced (null when single-variant). */
  confidence: number | null;
  /** Per-axis stability across variants — null when single-variant. */
  stability: OcularStability | null;
  /** Response metadata. */
  meta: OcularMeta;
  /** Per-turn salience trail when the input had ≥2 turns. */
  trajectory?: OcularTrajectoryEntry[];
}

// =============================================================================
// Steer (system-prompt compliance verification — /v1/steer)
// =============================================================================

/**
 * Verification outcome.
 *
 * - `COMPLIANT`: the proposed response already follows the system prompt.
 * - `REDEEMED`: the response violated a rule and was rewritten; use `response`.
 * - `CANNOT_COMPLY`: the system prompt itself is unprocessable (see
 *   `cannot_comply`); `response` is empty and `compliant` is false.
 */
export type SteerOutcome = 'COMPLIANT' | 'REDEEMED' | 'CANNOT_COMPLY';

/** Why a system prompt was rejected as unprocessable. */
export type SteerCannotComplyCategory =
  | 'violence'
  | 'csam'
  | 'terrorism'
  | 'safety_circumvention'
  | 'other';

/** Options for client.steer(). */
export interface SteerOptions {
  /** The system prompt defining the rules the AI should follow. */
  systemPrompt: string;

  /** The proposed AI response to verify against the system prompt. */
  proposedResponse: string;

  /**
   * Optional conversation history for context. When provided, the last
   * message must have `role: 'user'`.
   */
  messages?: Message[];

  /** Include the detailed audit trail in the response. */
  includeAudit?: boolean;
}

/** System-prompt quality assessment. */
export interface PromptQuality {
  /** Overall score, 0-100. */
  score: number;
  /** Letter grade derived from `score`. */
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  /** Per-dimension scores. */
  dimensions: {
    specificity: number;
    extractability: number;
    consistency: number;
    completeness: number;
    testability: number;
    actionability?: number;
  };
  /** Human-readable issues found with the prompt. */
  issues: string[];
}

/** Present when `outcome` is `CANNOT_COMPLY`. */
export interface SteerCannotComply {
  /** Why the system prompt is unprocessable. */
  reason: string;
  /** The category of concern. */
  category: SteerCannotComplyCategory;
}

/** Conversation context echoed back when `messages` were supplied. */
export interface SteerConversationContext {
  turn_count: number;
  triggering_user_message?: string;
}

/** Preprocess stage — red lines and watch items extracted from the prompt. */
export interface SteerPreprocessStage {
  red_lines: number;
  watch_items: number;
  persona?: string;
  cached: boolean;
  latency_ms: number;
}

/** Screen stage — deterministic string/regex/evasion checks. */
export interface SteerScreenStage {
  passed: boolean;
  /** Forbidden items found in the response. */
  hits: number;
  /** Required items not found. */
  misses: number;
  /** Detected evasion attempts. */
  evasion_patterns: string[];
  latency_ms: number;
}

/**
 * Verify stage — LLM verification with early exits.
 *
 * `analysis_score` / `analysis_compliant` are populated only when the
 * analysis exit point ran (i.e. triage did not resolve the outcome).
 *
 * Note: docs.nope.net documents a richer planned shape (a nested
 * `analysis` object with per-rule fulfilment, and a `redemption` block).
 * That is not yet emitted by the production gateway, which returns the
 * flat fields below. Forward-compatible extra fields are preserved at
 * runtime when the API begins returning them.
 */
export interface SteerVerifyStage {
  exit_point: 'TRIAGE' | 'ANALYSIS' | 'REDEMPTION';
  /** Triage confidence, 0-100. */
  triage_confidence: number;
  /** Overall compliance score in [0, 1] (present when analysis ran). */
  analysis_score?: number;
  /** Whether analysis judged the response compliant (present when analysis ran). */
  analysis_compliant?: boolean;
  latency_ms: number;
}

/** The three-stage pipeline breakdown. */
export interface SteerStages {
  preprocess: SteerPreprocessStage;
  screen: SteerScreenStage;
  verify: SteerVerifyStage;
}

/** Response from POST /v1/steer. */
export interface SteerResponse {
  /** Verification outcome. */
  outcome: SteerOutcome;
  /** Whether the original response was compliant. */
  compliant: boolean;
  /** Whether the response was modified (redeemed). */
  modified: boolean;
  /** Final response — original if compliant, redeemed if not, empty if CANNOT_COMPLY. */
  response: string;
  /** Present when `outcome` is `CANNOT_COMPLY`. */
  cannot_comply?: SteerCannotComply;
  /** Present when `messages` were supplied. */
  conversation?: SteerConversationContext;
  /** System-prompt quality assessment. */
  prompt_quality?: PromptQuality;
  /** Pipeline stage details. */
  stages: SteerStages;
  /** Detailed audit trail (present when `includeAudit` was true). */
  audit?: unknown;
  /** Request id. */
  request_id: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Total latency (ms). */
  total_latency_ms: number;
}
