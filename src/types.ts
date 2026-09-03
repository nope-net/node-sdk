/**
 * NOPE SDK types (v1 API).
 *
 * Wire field names are never renamed. Response types model what the API
 * emits; request types model what it reads.
 */

import type { FetchLike, SleepFn } from './http.js';

// =============================================================================
// Core Enums / Literals
// =============================================================================

/**
 * Who is at risk, on the v1 wire.
 *
 * - self: the speaker
 * - other: someone else (friend, family, stranger)
 *
 * The classifier's internal `unknown` ("asking for a friend") is mapped to
 * `self` before the response is built, so it never appears on /v1/evaluate.
 * The legacy /v0/screen route still emits it: see {@link ScreenRiskSubject}.
 */
export type RiskSubject = 'self' | 'other';

/** Subject on the legacy /v0/screen wire, which keeps `unknown`. */
export type ScreenRiskSubject = 'self' | 'other' | 'unknown';

/**
 * What type of harm. Nine harm-based types:
 * - suicide: self-directed lethal intent
 * - self_harm: non-suicidal self-injury
 * - self_neglect: severe self-care failure with safeguarding concerns
 * - violence: harm directed at others
 * - abuse: physical, emotional, sexual, financial abuse patterns
 * - sexual_violence: rape, sexual assault, coerced sexual acts
 * - neglect: failure to provide care for dependents
 * - exploitation: trafficking, forced labour, sextortion, grooming
 * - stalking: persistent unwanted contact or surveillance
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

/** Severity scale (how bad). */
export type Severity = 'none' | 'mild' | 'moderate' | 'high' | 'critical';

/** Imminence scale (how soon). */
export type Imminence = 'not_applicable' | 'chronic' | 'subacute' | 'urgent' | 'emergency';

/**
 * Contact modality of a crisis resource. This is the field to branch on
 * when you need an actual line (`crisis_line`, `text_line`,
 * `emergency_number`) rather than a support service or a website.
 */
export type CrisisResourceType =
  | 'emergency_number'
  | 'crisis_line'
  | 'text_line'
  | 'chat_service'
  | 'support_service'
  | 'reporting_portal'
  | 'online_resource';

/**
 * What the resource is. `helpline` also covers support services (the API
 * buckets `support_service` under it), so use `type` to tell a line from a
 * service.
 */
export type CrisisResourceKind = 'helpline' | 'reporting_portal' | 'self_help_site';

/** Semantic priority tier for display and routing. */
export type CrisisResourcePriorityTier =
  | 'primary_national_crisis'
  | 'secondary_national_crisis'
  | 'specialist_issue_crisis'
  | 'population_specific_crisis'
  | 'support_info_and_advocacy'
  | 'emergency_services';

/** Confidence in the opening-hours data. */
export type HoursConfidence = 'verified' | 'unverified' | 'approximate' | 'unknown';

/** How well-known the resource is. */
export type ResourceProminence = 'high' | 'medium' | 'low';

/** Other contact method for a crisis resource. */
export interface OtherContact {
  /** Contact type (e.g. 'kakao', 'viber', 'signal'). */
  type: string;
  /** ID, URL, or number. */
  value: string;
  /** Human-readable label. */
  label?: string;
}

/** Pre-computed open/closed status for a crisis resource. */
export interface OpenStatus {
  /** Whether the resource is currently open. null = uncertain. */
  is_open: boolean | null;
  /** ISO timestamp of the next open/close transition. */
  next_change?: string;
  /** Confidence in this status. */
  confidence: 'high' | 'low' | 'none';
  /** Human-readable status message. */
  message?: string;
}

// =============================================================================
// Risk
// =============================================================================

/**
 * A single identified risk: one subject + type with its assessment. A
 * conversation can carry several (an abuse victim who is also suicidal).
 */
export interface Risk {
  /** What type of harm. */
  type: RiskType;

  /** Who is at risk. */
  subject: RiskSubject;

  /** How severe (none to critical). */
  severity: Severity;

  /** How soon (not_applicable to emergency). */
  imminence: Imminence;

  /**
   * Evidence features supporting this risk (e.g. 'passive_ideation',
   * 'hopelessness'). The key is absent when no feature fired.
   */
  features?: string[];
}

// =============================================================================
// Crisis Resources
// =============================================================================

/**
 * A crisis resource (helpline, text line, reporting portal, website).
 *
 * Contact fields are flattened to the top level; `type` says which modality
 * the resource is. `open_status` is computed server-side at response time.
 */
export interface CrisisResource {
  /**
   * Database id. Present on search results; absent from evaluate, basic
   * and smart results until API fix A-6 deploys.
   */
  id?: string;
  /** Contact modality (how to reach them). */
  type: CrisisResourceType;
  /** Name of the resource or organisation. */
  name: string;
  /** Native-script name (e.g. いのちの電話) for non-English resources. */
  name_local?: string;
  /** Phone number. */
  phone?: string;
  /** Human-readable text instructions (e.g. 'Text HOME to 741741'). */
  text_instructions?: string;
  /** SMS number for sms: links (e.g. '741741'). */
  sms_number?: string;
  /** SMS body or keyword for sms: links (e.g. 'HOME'). */
  sms_body?: string;
  /** Chat URL. */
  chat_url?: string;
  /** WhatsApp deep link. */
  whatsapp_url?: string;
  /** Email address. */
  email?: string;
  /** WeChat ID. */
  wechat_id?: string;
  /** LINE deep link. */
  line_url?: string;
  /** Telegram deep link. */
  telegram_url?: string;
  /** Other contact methods not covered above. */
  other_contacts?: OtherContact[];
  /** Website URL. */
  website_url?: string;
  /** Human-readable availability (e.g. '24/7', 'Mon-Fri 9am-5pm'). */
  availability?: string;
  /** Machine-readable 24/7 flag. */
  is_24_7?: boolean;
  /** IANA timezone identifier (e.g. 'America/New_York'). */
  timezone?: string;
  /** OpenStreetMap opening_hours format (e.g. 'Mo-Fr 09:00-17:00'). */
  opening_hours_osm?: string;
  /** Confidence in the hours data. */
  hours_confidence?: HoursConfidence;
  /** Pre-computed open/closed status. */
  open_status?: OpenStatus;
  /** Languages supported (ISO 639-1 codes). */
  languages?: string[];
  /** Description of the service. */
  description?: string;
  /** What the resource is (helpline, reporting portal, self-help site). */
  resource_kind?: CrisisResourceKind;
  /** Issues this resource handles (see {@link ServiceScope}). */
  service_scope?: string[];
  /** Populations this resource serves (see {@link Population}). */
  population_served?: string[];
  /** Semantic priority for display and routing. */
  priority_tier?: CrisisResourcePriorityTier;
  /** Freeform tags for filtering and display. */
  tags?: string[];
  /** How well-known the resource is. */
  prominence?: ResourceProminence;
  /** ISO 3166-1 alpha-2 codes this resource serves. Absent or empty = global. */
  country_codes?: string[];
  /** ISO 3166-2 subdivision codes (e.g. 'US-CA', 'GB-NIR'). Absent or empty = country-wide. */
  subdivision_codes?: string[];
}

// =============================================================================
// Evaluate: request
// =============================================================================

/** A message in the conversation. */
export interface Message {
  role: 'user' | 'assistant';
  content: string;
  /** ISO 8601. Accepted by the API and not used by the v1 classifier. */
  timestamp?: string;
}

/**
 * Configuration for an evaluate request. These are the only keys the v1
 * route reads.
 */
export interface EvaluateConfig {
  /**
   * ISO 3166-1 alpha-2 country for crisis resources (default 'US').
   *
   * Demo mode: the client also sends this value as `user_country`, which the
   * /v1/try/evaluate route reads until API fix A-1 deploys.
   */
  country?: string;

  /**
   * Include crisis resources in the response. Default true. The demo route
   * ignores `false` and always returns resources (API fix A-1).
   */
  include_resources?: boolean;

  /** Your conversation id, echoed on webhook payloads. */
  conversation_id?: string;

  /** Your end-user id, echoed on webhook payloads. */
  end_user_id?: string;
}

/** Wire body of POST /v1/evaluate. */
export interface EvaluateRequest {
  /** Conversation messages. Either messages or text must be provided. */
  messages?: Message[];

  /** Plain text input. Either messages or text must be provided. */
  text?: string;

  /** Configuration options. */
  config?: EvaluateConfig;
}

/** Options for the evaluate method. */
export interface EvaluateOptions {
  /** Conversation messages (1 to 100, roles user|assistant). Either messages or text. */
  messages?: Message[];

  /** Plain text input (up to 50,000 characters). Either messages or text. */
  text?: string;

  /** Configuration options. */
  config?: EvaluateConfig;
}

// =============================================================================
// Evaluate: response
// =============================================================================

/** Metadata about the request and response. */
export interface EvaluateMetadata {
  /** Always 'v1'. */
  api_version: 'v1';

  /** Whether the input arrived as messages or as a text blob. The demo route always reports 'structured'. */
  input_format: 'structured' | 'text_blob';

  /** True when the input was truncated before classification (demo keeps the last 10 messages). */
  messages_truncated?: boolean;

  /** True when served by /v1/try/evaluate. */
  try_endpoint?: boolean;

  /** Model identifier; demo route only. */
  model?: string;
}

/** A crisis resource with a short relevance note. */
export type EvaluateResource = CrisisResource & {
  /** One-line note on why this resource was chosen. */
  why: string;
};

/** Crisis resources matched to the detected risks. */
export interface EvaluateResources {
  /** The resource to show first. */
  primary: EvaluateResource;
  /** Up to three further resources. */
  secondary: EvaluateResource[];
}

/** Response from POST /v1/evaluate (and /v1/try/evaluate). */
export interface EvaluateResponse {
  /** Identified risks; empty when nothing was detected. */
  risks: Risk[];

  /** Reasoning behind the assessment. */
  rationale: string;

  /** Highest severity among risks where subject is 'self'. */
  speaker_severity: Severity;

  /** Highest imminence among risks where subject is 'self'. */
  speaker_imminence: Imminence;

  /** Whether crisis resources should be shown to the speaker. */
  show_resources: boolean;

  /** Matched crisis resources; present when show_resources is true and resources were requested. */
  resources?: EvaluateResources;

  /** Unique request id for audit correlation. */
  request_id: string;

  /** ISO 8601 timestamp. */
  timestamp: string;

  /** Request and response metadata. */
  metadata?: EvaluateMetadata;
}

// =============================================================================
// Client Options
// =============================================================================

/** Options for creating a NopeClient */
export interface NopeClientOptions {
  /**
   * Your NOPE API key (`nope_live_...`, from dashboard.nope.net). Omit it
   * for demo mode or for endpoints that need no key.
   */
  apiKey?: string;

  /** Override the API base URL. Defaults to https://api.nope.net (a trailing slash is tolerated). */
  baseUrl?: string;

  /** Request timeout in milliseconds. Defaults to 30000 (30 seconds). */
  timeout?: number;

  /**
   * Route calls to the unauthenticated `/v1/try/*` endpoints (per-IP rate
   * limited, no key needed): evaluate, oversight.analyze, ocular and
   * signpostSmart. Everything else throws "not available in demo mode".
   */
  demo?: boolean;

  /**
   * Retries on 429 and 503 only (both are billing-safe to retry), waiting
   * `Retry-After` seconds, capped at 30 s per wait. Defaults to 2. Timeouts,
   * connection errors and other 5xx are never retried.
   */
  maxRetries?: number;

  /**
   * Fetch implementation. Defaults to the global `fetch`. Inject a fake in
   * tests or a wrapped fetch to add tracing.
   */
  fetch?: FetchLike;

  /** Sleep used between retries. Defaults to setTimeout. Inject in tests. */
  sleep?: SleepFn;
}

// =============================================================================
// Screen Types (legacy /v0/screen; use evaluate() instead)
// =============================================================================

/** @deprecated Use evaluate() and Risk. A risk on the legacy /v0/screen wire. */
export interface ScreenRisk {
  /** What type of harm. */
  type: RiskType;

  /** Who is at risk (the v0 wire keeps 'unknown'). */
  subject: ScreenRiskSubject;

  /** How severe. */
  severity: Severity;

  /** How soon. */
  imminence: Imminence;

  /** Confidence in this risk assessment (0.0 to 1.0). */
  confidence: number;
}

/** @deprecated Recommended supportive reply on the legacy /v0/screen wire. */
export interface ScreenRecommendedReply {
  /** The recommended reply content. */
  content: string;

  /** Always 'llm_generated'. */
  source: 'llm_generated';
}

/** @deprecated Crisis resources returned by the legacy /v0/screen endpoint. */
export interface ScreenCrisisResources {
  primary: CrisisResource;
  secondary: CrisisResource[];
}

/** @deprecated Debug information for the legacy /v0/screen endpoint (only when requested). */
export interface ScreenDebugInfo {
  model: string;
  latency_ms: number;
}

/** @deprecated Use evaluate(). Configuration for the legacy /v0/screen endpoint. */
export interface ScreenConfig {
  /** ISO country code for crisis resources (default 'US'). */
  country?: string;

  /** Include debug info (model, latency). */
  debug?: boolean;

  /** Generate a recommended supportive reply (extra cost). */
  include_recommended_reply?: boolean;
}

/** @deprecated Options for the screen method. */
export interface ScreenOptions {
  /** Conversation messages (1 to 100). Either messages or text. */
  messages?: Message[];

  /** Plain text input. Either messages or text. */
  text?: string;

  /** Configuration options. */
  config?: ScreenConfig;
}

/**
 * @deprecated Use evaluate() and EvaluateResponse.
 * Response from the legacy /v0/screen endpoint.
 */
export interface ScreenResponse {
  /** Detected risks with type, subject, severity, imminence, confidence. */
  risks: ScreenRisk[];

  /** Whether crisis resources should be shown. */
  show_resources: boolean;

  /** Suicidal ideation detected (any risk of type 'suicide'). */
  suicidal_ideation: boolean;

  /** Self-harm detected (any risk of type 'self_harm'). */
  self_harm: boolean;

  /** Brief rationale for the assessment. */
  rationale: string;

  /** Crisis resources to display (only when show_resources is true). */
  resources?: ScreenCrisisResources;

  /** Request id for audit correlation. */
  request_id: string;

  /** ISO 8601 timestamp. */
  timestamp: string;

  /** Debug info (only when requested). */
  debug?: ScreenDebugInfo;

  /** Recommended supportive reply (only when requested and risks were detected). */
  recommended_reply?: ScreenRecommendedReply;
}

// =============================================================================
// Utility Functions
// =============================================================================

/** Numeric mapping for severity comparison. */
export const SEVERITY_SCORES: Record<Severity, number> = {
  none: 0,
  mild: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

/** Numeric mapping for imminence comparison. */
export const IMMINENCE_SCORES: Record<Imminence, number> = {
  not_applicable: 0,
  chronic: 1,
  subacute: 2,
  urgent: 3,
  emergency: 4,
};

/** Highest severity among risks where subject is 'self' ('none' when there are none). */
export function calculateSpeakerSeverity(risks: Risk[]): Severity {
  const speakerRisks = risks.filter((r) => r.subject === 'self');
  if (speakerRisks.length === 0) return 'none';
  const maxScore = Math.max(...speakerRisks.map((r) => SEVERITY_SCORES[r.severity]));
  const entries = Object.entries(SEVERITY_SCORES) as [Severity, number][];
  const match = entries.find(([, score]) => score === maxScore);
  return match ? match[0] : 'none';
}

/** Highest imminence among risks where subject is 'self' ('not_applicable' when there are none). */
export function calculateSpeakerImminence(risks: Risk[]): Imminence {
  const speakerRisks = risks.filter((r) => r.subject === 'self');
  if (speakerRisks.length === 0) return 'not_applicable';
  const maxScore = Math.max(...speakerRisks.map((r) => IMMINENCE_SCORES[r.imminence]));
  const entries = Object.entries(IMMINENCE_SCORES) as [Imminence, number][];
  const match = entries.find(([, score]) => score === maxScore);
  return match ? match[0] : 'not_applicable';
}

/** Whether any risk has subject 'other'. */
export function hasThirdPartyRisk(risks: Risk[]): boolean {
  return risks.some((r) => r.subject === 'other');
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
 * reference cutoffs (see docs.nope.net/ocular).
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
