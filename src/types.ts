/**
 * NOPE SDK Types
 *
 * TypeScript interfaces for API requests and responses.
 */

// =============================================================================
// Enums / Literals
// =============================================================================

export type Severity = 'none' | 'mild' | 'moderate' | 'high' | 'critical';
export type Imminence = 'not_applicable' | 'chronic' | 'subacute' | 'urgent' | 'emergency';
export type RiskDomain = 'self' | 'others' | 'dependent_at_risk' | 'victimisation';
export type SelfSubtype = 'suicidal_or_self_injury' | 'self_neglect' | 'other';
export type DependentSubtype = 'child' | 'adult_at_risk' | 'animal_or_other';
export type VictimisationSubtype =
  | 'IPV_intimate_partner'
  | 'family_non_intimate'
  | 'trafficking_exploitation'
  | 'community_violence'
  | 'institutional_abuse'
  | 'other';
export type EvidenceGrade = 'strong' | 'moderate' | 'weak' | 'consensus' | 'none';
export type CrisisResourceType =
  | 'emergency_number'
  | 'crisis_line'
  | 'text_line'
  | 'chat_service'
  | 'support_service';
export type CrisisResourceKind = 'helpline' | 'reporting_portal' | 'directory' | 'self_help_site';
export type CrisisResourcePriorityTier =
  | 'primary_national_crisis'
  | 'secondary_national_crisis'
  | 'specialist_issue_crisis'
  | 'population_specific_crisis'
  | 'support_info_and_advocacy'
  | 'support_directory_or_tool'
  | 'emergency_services';

// =============================================================================
// Request Types
// =============================================================================

/** A message in the conversation. */
export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string; // ISO 8601
}

/** Configuration for evaluation request. */
export interface EvaluateConfig {
  /** User's country for crisis resources (ISO country code). */
  user_country?: string;

  /** Locale for language/region (e.g., 'en-US', 'es-MX'). */
  locale?: string;

  /** User age band (affects response templates). Default: 'adult'. */
  user_age_band?: 'adult' | 'minor' | 'unknown';

  /** Policy ID to use. Default: 'default_mh'. */
  policy_id?: string;

  /** Dry run mode (evaluate but don't log/trigger webhooks). Default: false. */
  dry_run?: boolean;

  /** Whether to return a safe assistant reply. Default: true. */
  return_assistant_reply?: boolean;

  /** How NOPE should generate the recommended reply. */
  assistant_safety_mode?: 'template' | 'generate';

  /** Use multiple judges for higher confidence. Default: false. */
  use_multiple_judges?: boolean;

  /** Specify exact models to use (bypasses adaptive selection). */
  models?: string[];

  /** Customer-provided conversation ID for webhook correlation. */
  conversation_id?: string;

  /** Customer-provided end-user ID for webhook correlation. */
  end_user_id?: string;
}

/** Request to /v1/evaluate endpoint. */
export interface EvaluateRequest {
  /** Conversation messages. Either messages OR text must be provided. */
  messages?: Message[];

  /** Plain text input. Either messages OR text must be provided. */
  text?: string;

  /** Configuration options. */
  config: EvaluateConfig;

  /** Free-text user context to help shape responses. */
  user_context?: string;
}

// =============================================================================
// Response Types
// =============================================================================

/** A crisis resource (helpline, text line, etc.). */
export interface CrisisResource {
  type: CrisisResourceType;
  name: string;
  phone?: string;
  text_instructions?: string;
  chat_url?: string;
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

/** Cross-cutting clinical features (HOW risk manifests). */
export interface PresentationModifiers {
  psychotic_features?: boolean;
  substance_involved?: boolean;
  cognitive_impairment?: boolean;
  personality_features?: boolean;
  acute_decompensation?: boolean;
  self_neglect_severe?: boolean;
}

/** Legal/reporting markers. */
export interface SafeguardingFlags {
  child_at_risk?: boolean;
  adult_at_risk?: boolean;
  duty_to_warn_others?: boolean;
  mandatory_reporting_possible?: boolean;
}

/** Evidence-based strengths that reduce risk. */
export interface ProtectiveFactorsInfo {
  protective_factors?: string[];
  protective_factor_strength?: 'weak' | 'moderate' | 'strong';
}

/** Third party threat indicator. */
export interface ThirdPartyThreat {
  present: boolean;
  identifiable_victim: boolean;
  confidence: number;
  rationale: string;
  evidence_grade?: EvidenceGrade;
}

/** IPV risk indicator. */
export interface IntimatePartnerViolence {
  risk_level: 'standard' | 'elevated' | 'severe' | 'extreme';
  confidence: number;
  strangulation_history?: boolean;
  escalation_pattern?: boolean;
  evidence_grade?: EvidenceGrade;
}

/** Child safeguarding urgency. */
export interface ChildSafeguarding {
  urgency: 'routine' | 'prompt' | 'urgent' | 'emergency';
  confidence: number;
  basic_needs_unmet?: boolean;
  immediate_danger?: boolean;
  evidence_grade?: EvidenceGrade;
}

/** Vulnerable adult safeguarding. */
export interface VulnerableAdultSafeguarding {
  urgency: 'routine' | 'prompt' | 'urgent' | 'emergency';
  confidence: number;
  evidence_grade?: EvidenceGrade;
}

/** Animal cruelty indicator. */
export interface AnimalCrueltyIndicator {
  present: boolean;
  confidence: number;
  evidence_grade?: EvidenceGrade;
}

/** Legal/clinical flags with evidence grades. */
export interface LegalFlags {
  third_party_threat?: ThirdPartyThreat;
  intimate_partner_violence?: IntimatePartnerViolence;
  child_safeguarding?: ChildSafeguarding;
  vulnerable_adult_safeguarding?: VulnerableAdultSafeguarding;
  animal_cruelty_indicator?: AnimalCrueltyIndicator;
}

/** Global summary of the assessment. */
export interface GlobalAssessment {
  overall_severity: Severity;
  overall_imminence: Imminence;
  primary_concerns: string[];
  language?: string;
  locale?: string;
}

/** Base fields for domain assessments. */
export interface BaseDomainAssessment {
  severity: Severity;
  imminence: Imminence;
  confidence: number;
  risk_features: string[];
  risk_types?: string[];
  reasoning?: string;
}

/** Self domain assessment. */
export interface SelfDomainAssessment extends BaseDomainAssessment {
  domain: 'self';
  self_subtype: SelfSubtype;
}

/** Others domain assessment. */
export interface OthersDomainAssessment extends BaseDomainAssessment {
  domain: 'others';
}

/** Dependent at risk assessment. */
export interface DependentAtRiskAssessment extends BaseDomainAssessment {
  domain: 'dependent_at_risk';
  dependent_subtype: DependentSubtype;
}

/** Victimisation assessment. */
export interface VictimisationAssessment extends BaseDomainAssessment {
  domain: 'victimisation';
  victimisation_subtype?: VictimisationSubtype;
}

export type DomainAssessment =
  | SelfDomainAssessment
  | OthersDomainAssessment
  | DependentAtRiskAssessment
  | VictimisationAssessment;

/** Recommended reply content. */
export interface RecommendedReply {
  content: string;
  source: 'template' | 'llm_generated' | 'llm_validated_candidate';
  notes?: string;
}

/** A coping/support recommendation. */
export interface CopingRecommendation {
  category:
    | 'self_soothing'
    | 'social_support'
    | 'professional_support'
    | 'safety_planning'
    | 'means_safety';
  evidence_grade: EvidenceGrade;
}

/** Metadata about the request/response. */
export interface ResponseMetadata {
  access_level?: 'unauthenticated' | 'authenticated' | 'admin';
  is_admin?: boolean;
  messages_truncated?: boolean;
  messages_original_count?: number;
  messages_kept_count?: number;
  features_available?: string[];
  input_format?: 'structured' | 'text_blob';
  api_version: 'v1';
}

/** Response from /v1/evaluate endpoint. */
export interface EvaluateResponse {
  /** Domain-specific assessments. */
  domains: DomainAssessment[];

  /** Global summary. */
  global: GlobalAssessment;

  /** Legal/clinical flags with evidence grades. */
  legal_flags?: LegalFlags;

  /** Cross-cutting presentation modifiers. */
  presentation_modifiers?: PresentationModifiers;

  /** Safeguarding flags. */
  safeguarding_flags?: SafeguardingFlags;

  /** Protective factors. */
  protective_factors_info?: ProtectiveFactorsInfo;

  /** Overall confidence in assessment. */
  confidence: number;

  /** Judge agreement (if multiple judges). */
  agreement?: number;

  /** Crisis resources for user's region. */
  crisis_resources: CrisisResource[];

  /** Recommended reply content. */
  recommended_reply?: RecommendedReply;

  /** High-level coping/support categories. */
  coping_recommendations?: CopingRecommendation[];

  /** Metadata about the request/response. */
  metadata?: ResponseMetadata;
}

// =============================================================================
// Client Options
// =============================================================================

/** Options for creating a NopeClient. */
export interface NopeClientOptions {
  /** Your NOPE API key (starts with 'nope_live_' or 'nope_test_').
   * Can be undefined for local development/testing without auth. */
  apiKey?: string;

  /** Override the API base URL. Defaults to https://api.nope.net. */
  baseUrl?: string;

  /** Request timeout in milliseconds. Defaults to 30000 (30 seconds). */
  timeout?: number;
}

/** Options for the evaluate method. */
export interface EvaluateOptions {
  /** Conversation messages. Either messages OR text must be provided. */
  messages?: Message[];

  /** Plain text input. Either messages OR text must be provided. */
  text?: string;

  /** Configuration options. */
  config?: EvaluateConfig;

  /** Free-text user context to help shape responses. */
  userContext?: string;
}
