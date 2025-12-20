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
 * - unknown: Ambiguous - classic "asking for a friend" territory
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
  | 'support_service';

/** Crisis resource kind */
export type CrisisResourceKind = 'helpline' | 'reporting_portal' | 'directory' | 'self_help_site';

/** Crisis resource priority tier */
export type CrisisResourcePriorityTier =
  | 'primary_national_crisis'
  | 'secondary_national_crisis'
  | 'specialist_issue_crisis'
  | 'population_specific_crisis'
  | 'support_info_and_advocacy'
  | 'support_directory_or_tool'
  | 'emergency_services';

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
  type: CrisisResourceType;
  name: string;
  /** Native script name (e.g., いのちの電話) for non-English resources */
  name_local?: string;
  phone?: string;
  text_instructions?: string;
  chat_url?: string;
  /** WhatsApp deep link (e.g., 'https://wa.me/18002738255') */
  whatsapp_url?: string;
  website_url?: string;
  availability?: string;
  is_24_7?: boolean;
  languages?: string[];
  description?: string;
  resource_kind?: CrisisResourceKind;
  service_scope?: string[];
  population_served?: string[];
  priority_tier?: CrisisResourcePriorityTier;
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
  /** User's country for crisis resources (ISO country code) */
  user_country?: string;

  /** Locale for language/region (e.g., 'en-US', 'es-MX') */
  locale?: string;

  /** User age band (affects response templates). Default: 'adult' */
  user_age_band?: 'adult' | 'minor' | 'unknown';

  /** Dry run mode (evaluate but don't log/trigger webhooks). Default: false */
  dry_run?: boolean;

  /** Use multiple judges for higher confidence. Default: false */
  use_multiple_judges?: boolean;

  /** Specify exact models to use (admin only) */
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
}

/** Response from /v1/evaluate endpoint */
export interface EvaluateResponse {
  /** Communication style analysis */
  communication: CommunicationAssessment;

  /** Identified risks (the core of v1) */
  risks: Risk[];

  /** Quick summary (derived from risks) */
  summary: Summary;

  /** Legal/safety flags */
  legal_flags?: LegalFlags;

  /** Protective factors */
  protective_factors?: ProtectiveFactorsInfo;

  /** Overall confidence in assessment */
  confidence: number;

  /** Judge agreement (if multiple judges) */
  agreement?: number;

  /** Crisis resources for user's region */
  crisis_resources: CrisisResource[];

  /** Pre-built widget URL (only when speaker_severity > 'none') */
  widget_url?: string;

  /** Recommended reply content */
  recommended_reply?: RecommendedReply;

  /** Filter stage results */
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
// Screen Types (for /v1/screen endpoint)
// =============================================================================

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

/** Crisis resources returned by /v1/screen endpoint */
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

/** Debug information for /v1/screen (only if requested) */
export interface ScreenDebugInfo {
  model: string;
  latency_ms: number;
  raw_response?: string;
}

/** Configuration for /v1/screen request */
export interface ScreenConfig {
  /** Include debug info (latency, raw response) */
  debug?: boolean;
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
 * Response from /v1/screen endpoint
 *
 * Lightweight crisis screening for SB243 compliance.
 * Uses C-SSRS framework for evidence-based severity assessment.
 */
export interface ScreenResponse {
  /** Should crisis resources be shown? */
  referral_required: boolean;

  /** Type of crisis detected (null if none) */
  crisis_type: 'suicidal_ideation' | 'self_harm' | null;

  /** C-SSRS level (0-5) - evidence-based severity measure */
  cssrs_level: number;

  /** Self-harm (NSSI) specifically detected */
  self_harm_detected: boolean;

  /** Confidence in assessment (0-1) */
  confidence: number;

  /** Brief rationale for assessment */
  rationale: string;

  /** Crisis resources to display (only when referral_required) */
  resources?: ScreenCrisisResources;

  /** Pre-built widget URL (only when referral_required) */
  widget_url?: string;

  /** Suggested display text (only when referral_required) */
  display_text?: ScreenDisplayText;

  /** Request ID for audit trail */
  request_id: string;

  /** ISO timestamp for audit trail */
  timestamp: string;

  /** Debug info (only if requested) */
  debug?: ScreenDebugInfo;
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
 * Only considers risks where subject='self' and subject_confidence > 0.5
 */
export function calculateSpeakerSeverity(risks: Risk[]): Severity {
  const speakerRisks = risks.filter((r) => r.subject === 'self' && r.subject_confidence > 0.5);

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
 */
export function calculateSpeakerImminence(risks: Risk[]): Imminence {
  const speakerRisks = risks.filter((r) => r.subject === 'self' && r.subject_confidence > 0.5);

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
 */
export function hasThirdPartyRisk(risks: Risk[]): boolean {
  return risks.some((r) => r.subject === 'other' && r.subject_confidence > 0.5);
}
