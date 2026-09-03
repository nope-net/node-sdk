/**
 * NOPE SDK types (v1 API).
 *
 * Wire field names are never renamed. Response types model what the API
 * emits; request types model what it reads.
 */

import type { OversightBehaviorCategory, OversightBehaviorCode } from './generated/oversight-taxonomy.js';
import type { Population, ServiceScope } from './generated/signpost-taxonomy.js';
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
// Signpost Types (crisis resources: GET /v1/signpost/*)
// =============================================================================

/**
 * Filters for the basic signpost lookup. Arrays are sent comma-joined.
 */
export interface SignpostConfig {
  /** Service scopes to filter by (e.g. 'suicide', 'domestic_violence'); see {@link ServiceScope}. */
  scopes?: ServiceScope[];

  /** Populations to filter by (e.g. 'youth', 'veterans', 'lgbtq'); see {@link Population}. */
  populations?: Population[];

  /** ISO 3166-2 subdivision codes within the country (e.g. 'US-CA', 'GB-NIR'). */
  subdivisions?: string[];

  /** Maximum number of resources (server cap 10). */
  limit?: number;

  /** Only 24/7 urgent resources. */
  urgent?: boolean;
}

/**
 * Options for signpost(). Filters may be given under `config` or at the top
 * level; a top-level value wins over the same key in `config`.
 */
export interface SignpostOptions extends SignpostConfig {
  /** ISO 3166-1 alpha-2 country code (e.g. 'US', 'GB'). */
  country: string;

  /** Filters (alternative to the top-level keys). */
  config?: SignpostConfig;
}

/** Response from GET /v1/signpost. */
export interface SignpostResponse {
  /** Country code (ISO 3166-1 alpha-2). */
  country: string;

  /** Crisis resources. */
  resources: CrisisResource[];

  /** Number of resources returned. */
  count: number;

  /** Resources matching the requested scopes (only when scopes were given). */
  primary?: CrisisResource[];

  /** General resources (only when scopes were given). */
  secondary?: CrisisResource[];

  /** Scopes that were requested (only when given). */
  scopes_requested?: string[];
}

/** Filters for signpostSmart(). The ranker returns up to 5 picks whatever `limit` says. */
export interface SignpostSmartConfig {
  /** Service scopes to narrow the candidate pool; see {@link ServiceScope}. */
  scopes?: ServiceScope[];

  /** Populations to narrow the candidate pool; see {@link Population}. */
  populations?: Population[];

  /** Maximum number of ranked picks (at most 5 come back). */
  limit?: number;
}

/** Options for signpostSmart(). */
export interface SignpostSmartOptions {
  /** ISO 3166-1 alpha-2 country code. */
  country: string;

  /** Natural-language description of the situation (max 500 characters). */
  query: string;

  /** Optional filters. */
  config?: SignpostSmartConfig;
}

/** A resource with its rank and a short relevance note. */
export interface RankedResource {
  /** The crisis resource. */
  resource: CrisisResource;

  /** One or two sentences on why this resource fits the query. */
  why: string;

  /** Rank position (1 = most relevant). */
  rank: number;
}

/** Response from GET /v1/signpost/smart (and /v1/try/signpost/smart). */
export interface SignpostSmartResponse {
  /** Country code. */
  country: string;

  /** The query that was ranked. */
  query: string;

  /** Up to 5 resources ranked by relevance. */
  ranked: RankedResource[];

  /** Number of ranked resources. */
  count: number;

  /** Scopes that were requested (only when given). */
  scopes_requested?: string[];

  /** Present when the country has no candidate resources (ranked is empty). */
  message?: string;

  /** True when served by /v1/try/signpost/smart. */
  try_endpoint?: boolean;
}

/** Response from GET /v1/signpost/:id. */
export interface SignpostByIdResponse {
  /** The requested crisis resource. */
  resource: CrisisResource;
}

/** Response from GET /v1/signpost/countries. */
export interface SignpostCountriesResponse {
  /** Supported country codes (ISO 3166-1 alpha-2). */
  countries: string[];

  /** Number of countries. */
  count: number;
}

/** Options for detectCountry(). */
export interface DetectCountryOptions {
  /**
   * Country to assert, sent as the `x-country` header. Useful when your own
   * edge already knows the country: the API echoes it back in the typed
   * shape.
   */
  countryHint?: string;
}

/**
 * Wire response from GET /v1/signpost/detect-country.
 *
 * Detection reads the geo headers a proxy injects (`cf-ipcountry`,
 * `x-country`, `x-vercel-ip-country`, `cf-region-code`, `cf-region`). A
 * direct call to api.nope.net has none of them and returns the miss shape
 * (`country_code: ''`, `error` set) with HTTP 200. `country_name` is also
 * `''` for any detected country outside the API's 36-entry name map; key on
 * `country_code`.
 */
export interface DetectCountryResponse {
  /** Detected country code, or '' when not detected. */
  country_code: string;

  /** Human-readable country name, or '' when unknown. */
  country_name: string;

  /** ISO 3166-2 subdivision (e.g. 'US-CA', 'GB-SCT') when the proxy supplied a region. */
  subdivision_code?: string;

  /** Region name when the proxy supplied one. */
  subdivision_name?: string;

  /** Set on a miss. */
  error?: string;
}

/** detectCountry() result: the wire response plus a derived `detected` flag. */
export interface DetectCountryResult extends DetectCountryResponse {
  /** `country_code !== ''`. */
  detected: boolean;
}

// -----------------------------------------------------------------------------
// Signpost search (vector semantic search: GET /v1/signpost/search)
// -----------------------------------------------------------------------------

/** Options for signpostSearch(). */
export interface SignpostSearchOptions {
  /** Natural-language search query (max 500 characters). */
  query: string;

  /** Optional ISO 3166-1 alpha-2 country code to filter results. */
  country?: string;

  /** Maximum number of results (default 10, max 50). */
  limit?: number;

  /** Similarity threshold in [0, 1] (default 0.3). Higher is stricter. */
  threshold?: number;
}

/** A contact method on a search hit (the raw database record). */
/**
 * One contact method on a search row, as the directory stores it. Only `type`
 * is always present: the live wire mixes `{type, value}`, `{type, url}`
 * (chat contacts), `{label, type, value}` and tiered rows with `source` and
 * `confidence` (fixture signpost/search.auth.mixed-contacts.json).
 */
export interface SignpostSearchContact {
  /** Contact type: 'phone', 'sms', 'chat', 'email', 'whatsapp', ... */
  type: string;
  /** Number or address; chat contacts carry `url` instead. */
  value?: string;
  /** URL for chat and web contacts. */
  url?: string;
  /** Display label, when the directory has one. */
  label?: string;
  /** Contact tier as stored ('1' is primary); absent on untiered rows. */
  tier?: string | number;
  /** Where the contact was sourced. */
  source?: string | null;
  /** Confidence in the contact. */
  confidence?: string | number;
}

/** Open status on a search hit; nulls where unknown. */
export interface SignpostSearchOpenStatus {
  is_open: boolean | null;
  next_change: string | null;
  confidence: string;
  message: string | null;
}

/**
 * A semantic-search hit. Search returns the raw resource row (plural field
 * names, explicit nulls) with tier-1 contacts flattened on top, so it does
 * not share {@link CrisisResource}'s shape. It is the only signpost result
 * that carries the database `id` today.
 */
export interface SignpostSearchResult {
  id: string;
  name: string;
  name_local: string | null;
  country_code: string;
  subdivision_code: string | null;
  country_codes: string[];
  subdivision_codes: string[];
  service_scopes: string[];
  populations: string[];
  description: string | null;
  resource_type: string;
  contacts: SignpostSearchContact[];
  website_url: string | null;
  is_24_7: boolean;
  availability: string | null;
  timezone: string | null;
  opening_hours_osm: string | null;
  hours_confidence: string | null;
  languages: string[];
  /** Cosine similarity to the query in [0, 1]. */
  similarity: number;
  /** Flattened tier-1 contacts. */
  phone?: string;
  sms_number?: string;
  chat_url?: string;
  whatsapp_url?: string;
  email?: string;
  line_url?: string;
  telegram_url?: string;
  wechat_id?: string;
  /** `resource_type` as the CrisisResource modality. */
  type: CrisisResourceType;
  open_status: SignpostSearchOpenStatus;
}

/** Response from GET /v1/signpost/search. */
export interface SignpostSearchResponse {
  /** The query that was run. */
  query: string;

  /** Country filter applied, or null when unfiltered. */
  country: string | null;

  /** Hits ranked by similarity. */
  results: SignpostSearchResult[];

  /** Number of hits. */
  count: number;

  /** Timing breakdown in milliseconds. */
  timing: {
    embed_ms: number;
    search_ms: number;
    total_ms: number;
  };
}

// -----------------------------------------------------------------------------
// Deprecated /v1/resources/* aliases (sunset 2027-01-01; use signpost*)
// -----------------------------------------------------------------------------

/** @deprecated Use SignpostConfig. Sunset 2027-01-01. */
export type ResourcesConfig = SignpostConfig;

/** @deprecated Use SignpostOptions. Sunset 2027-01-01. */
export type ResourcesOptions = SignpostOptions;

/** @deprecated Use SignpostResponse. Sunset 2027-01-01. */
export type ResourcesResponse = SignpostResponse;

/** @deprecated Use SignpostSmartOptions. Sunset 2027-01-01. */
export type ResourcesSmartOptions = SignpostSmartOptions;

/** @deprecated Use SignpostSmartResponse. Sunset 2027-01-01. */
export type ResourcesSmartResponse = SignpostSmartResponse;

/** @deprecated Use SignpostByIdResponse. Sunset 2027-01-01. */
export type ResourceByIdResponse = SignpostByIdResponse;

/** @deprecated Use SignpostCountriesResponse. Sunset 2027-01-01. */
export type ResourcesCountriesResponse = SignpostCountriesResponse;

// =============================================================================
// Oversight Types (for /v1/oversight/* endpoints)
// =============================================================================

/**
 * Concern level for AI behavior analysis: none, low, medium, high, critical.
 */
export type ConcernLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

/**
 * Direction of concern across the conversation. In fast mode this is the
 * constant `stable` (no trajectory is computed).
 */
export type Trajectory = 'improving' | 'stable' | 'worsening';

/** Severity of a detected behavior. */
export type OversightSeverity = 'low' | 'medium' | 'high' | 'critical';

/** Human response indicators observed in the conversation. */
export type HumanIndicatorType =
  | 'distress_markers'
  | 'acquiescence'
  | 'disengagement'
  | 'escalation'
  | 'pushback';

/**
 * Analysis strategy (authenticated route only; the demo route ignores it).
 * - single: one pass over the conversation
 * - sliding: overlapping windows, for long conversations (50+ messages auto-selects it)
 */
export type OversightAnalysisStrategy = 'single' | 'sliding';

/**
 * Analysis depth.
 * - full: default; narrative summary, pattern assessment, per-turn analysis
 * - fast: single pass on a faster model; `trajectory` is always `stable`,
 *   `turn_analysis` and `human_indicators` are empty, `summary` and
 *   `pattern_assessment` are absent
 */
export type OversightAnalysisMode = 'full' | 'fast';

/** A message in an Oversight conversation. */
export interface OversightMessage {
  /** Message role. */
  role: 'user' | 'assistant' | 'system';

  /** Message content. */
  content: string;

  /** Your identifier for this message. */
  message_id?: string;

  /** When this message was sent (ISO 8601). */
  timestamp?: string;

  /** Agent or bot identifier that produced this message (assistant messages). */
  agent_id?: string;

  /** Agent version string. */
  agent_version?: string;

  /** Retrieved RAG or memory context that informed this response. */
  context?: string;
}

/** Metadata about an Oversight conversation. Extra keys are stored without indexing. */
export interface OversightConversationMetadata {
  /** Hashed end-user identifier, for cross-session trajectory tracking. */
  user_id_hash?: string;

  /** Your session identifier. */
  session_id?: string;

  /** Session number for this user (1, 2, 3...). */
  session_number?: number;

  /** Whether the end-user is a minor (escalates severity). */
  user_is_minor?: boolean;

  /** Age bracket of the end-user. */
  user_age_bracket?: 'child' | 'teen' | 'adult' | 'unknown';

  /** Platform where the conversation occurred (e.g. 'ios', 'web', 'discord'). */
  platform?: string;

  /** Product or bot name. */
  product?: string;

  /** When the conversation started (ISO 8601). */
  started_at?: string;

  /** When the conversation ended (ISO 8601). */
  ended_at?: string;

  /** Your tags for categorisation. */
  tags?: string[];

  /** Additional fields are preserved but not indexed. */
  [key: string]: unknown;
}

/** A conversation to analyze with Oversight. */
export interface OversightConversation {
  /** Your identifier for the conversation (required for ingest). */
  conversation_id?: string;

  /** Messages in the conversation. The demo route accepts at most 20. */
  messages: OversightMessage[];

  /** Optional metadata about the conversation. */
  metadata?: OversightConversationMetadata;
}

/** A detected behavior at a specific assistant turn. */
export interface DetectedBehavior {
  /** Behavior code (see {@link OversightBehaviorCode}). */
  code: string;

  /** Severity of this instance. */
  severity: OversightSeverity;

  /** Assistant turn where the behavior was detected. Turns are numbered from 1. */
  turn_number: number;

  /** Evidence quote from the conversation. */
  evidence: string;

  /** Why this behavior was flagged. */
  reasoning: string;
}

/** A behavior aggregated across turns. */
export interface AggregatedBehavior {
  /** Behavior code (see {@link OversightBehaviorCode}). */
  code: string;

  /** Highest severity across instances. */
  severity: OversightSeverity;

  /** Number of turns where this behavior appeared (always 1 in fast mode). */
  turn_count: number;

  /** Actionable recommendation for correcting this behavior. */
  recommendation?: string;
}

/** Per-turn analysis (assistant turns only). */
export interface TurnAnalysis {
  /** Assistant turn number, numbered from 1. */
  turn_number: number;

  /** Always 'assistant'. */
  role: 'assistant';

  /** Brief summary of the turn. */
  content_summary: string;

  /** Behaviors detected in this turn. */
  behaviors: DetectedBehavior[];

  /** Whether the AI missed an opportunity to intervene. */
  missed_intervention: boolean;
}

/** Human response indicator. */
export interface HumanIndicator {
  /** Type of indicator. */
  type: HumanIndicatorType;

  /** What was observed. */
  observation: string;

  /** Turn numbers where this was observed (numbered from 1). */
  turns: number[];
}

/** Analysis of one window in a sliding-window run. */
export interface WindowAnalysis {
  /** Which messages the window covered. */
  window: {
    /** @deprecated Use message_range.start_index. Inclusive 0-based message index. */
    start_turn: number;
    /** @deprecated Use message_range.end_index_exclusive. Exclusive 0-based message index. */
    end_turn: number;
    /** Exact 0-based message slice used for this window. */
    message_range?: {
      start_index: number;
      end_index_exclusive: number;
    };
    /** 1-based conversation turn range represented by this window. */
    conversation_turn_range?: {
      start_turn: number;
      end_turn: number;
    };
  };

  /** Concern level at this window. */
  concern: ConcernLevel;

  /** Behaviors detected within this window. */
  behaviors: DetectedBehavior[];

  /** Turn-by-turn analysis within the window. */
  turn_analysis: TurnAnalysis[];

  /** Human response indicators within the window. */
  human_indicators: HumanIndicator[];

  /** Summary of this window. */
  summary: string;
}

/** A point where concern changed between consecutive windows. */
export interface InflectionPoint {
  /** Conversation turn (1-based) where the change occurred. */
  turn: number;

  /** Concern before this turn. */
  concern_before: ConcernLevel;

  /** Concern after this turn. */
  concern_after: ConcernLevel;

  /** Behaviors that triggered the change. */
  trigger_behaviors: string[];
}

/**
 * Filter applied to results after analysis (the model still sees the full
 * taxonomy). `enabled` and `disabled` are mutually exclusive when both are
 * non-empty.
 */
export interface OversightBehaviorFilter {
  /** Only include these behavior codes (allowlist). */
  enabled?: OversightBehaviorCode[];

  /** Exclude these behavior codes (blocklist). */
  disabled?: OversightBehaviorCode[];

  /** Only include behaviors at or above this severity. */
  min_severity?: OversightSeverity;

  /** Only include behaviors from these categories. */
  categories?: OversightBehaviorCategory[];
}

/** Result of an Oversight analysis. */
export interface OversightAnalysisResult {
  /** Conversation identifier (yours, or one the API generated). */
  conversation_id: string;

  /** When the analysis ran (ISO 8601). */
  analyzed_at: string;

  /** Brief summary of the conversation (empty string in fast mode). */
  conversation_summary: string;

  /** Overall concern level. */
  overall_concern: ConcernLevel;

  /** Direction of concern (always 'stable' in fast mode). */
  trajectory: Trajectory;

  /** Operator-facing summary of key findings. Absent in fast mode. */
  summary?: string;

  /** Pattern assessment across turns. Absent in fast mode. */
  pattern_assessment?: string;

  /** Turn-by-turn analysis of assistant turns (empty in fast mode). */
  turn_analysis: TurnAnalysis[];

  /** Human response indicators (empty in fast mode). */
  human_indicators: HumanIndicator[];

  /** Behaviors aggregated across turns. */
  detected_behaviors: AggregatedBehavior[];

  /** Model used for the analysis. */
  model_used?: string;

  /** Analysis latency in milliseconds. */
  latency_ms?: number;

  /** Which analysis mode ran. */
  mode_used?: OversightAnalysisMode;

  /** The behavior filter that was applied, echoed back. */
  filter_applied?: OversightBehaviorFilter;

  /** Sliding strategy: per-window analyses. */
  windows?: WindowAnalysis[];

  /** Sliding strategy: concern level per window. */
  concern_progression?: ConcernLevel[];

  /** Sliding strategy: highest window concern. */
  peak_concern?: ConcernLevel;

  /** Sliding strategy: last window concern. */
  final_concern?: ConcernLevel;

  /** Sliding strategy: turns where concern changed. */
  inflection_points?: InflectionPoint[];

  /** Sliding strategy: context carried into the next window. */
  context_for_next_window?: string;

  /** Narrative summary for cross-session aggregation. */
  narrative_summary?: string;

  /** Prompt tokens used. */
  prompt_tokens?: number;

  /** Completion tokens used. */
  completion_tokens?: number;

  /** Raw model output (only when `include_raw_xml` was set). */
  raw_xml?: string;
}

/** Configuration for oversight.analyze. */
export interface OversightAnalyzeConfig {
  /** Force a strategy; auto-selected by length when omitted. Ignored by the demo route. */
  strategy?: OversightAnalysisStrategy;

  /** Analysis depth; defaults to 'full'. */
  mode?: OversightAnalysisMode;

  /** Include the raw model output in the response. */
  include_raw_xml?: boolean;

  /** Custom model identifier. Ignored by the demo route. */
  model?: string;
}

/** Options for oversight.analyze. */
export interface OversightAnalyzeOptions {
  /** Conversation to analyze. */
  conversation: OversightConversation;

  /**
   * Free-form description of the bot or persona being analyzed, so expected
   * behaviour (a companion persona saying "I love you") is not flagged.
   * Accepted by the API; server-side propagation into the analysis is being
   * fixed (API fix A-2).
   */
  bot_context?: string;

  /** Configuration options. */
  config?: OversightAnalyzeConfig;

  /** Filter which behaviors appear in the results. */
  behaviors?: OversightBehaviorFilter;
}

/** Response from POST /v1/oversight/analyze (authenticated). */
export interface OversightAnalyzeResponse {
  /** Analysis result. */
  result: OversightAnalysisResult;

  /** Which strategy ran. */
  strategy: OversightAnalysisStrategy;

  /** Why that strategy was chosen. */
  strategy_reason: string;
}

/** Response from POST /v1/try/oversight/analyze (demo mode). */
export interface OversightDemoAnalyzeResponse {
  /** 'fast' when config.mode was 'fast', else 'single'. */
  mode: 'single' | 'fast';

  /** Analysis result. */
  result: OversightAnalysisResult;

  /** Always true. */
  try_endpoint: true;
}

/** Response type of oversight.analyze for a client constructed with the given `demo` flag. */
export type OversightAnalyzeResponseFor<Demo extends boolean> = Demo extends true
  ? OversightDemoAnalyzeResponse
  : OversightAnalyzeResponse;

/** Configuration for oversight.ingest. */
export interface OversightIngestConfig {
  /** Custom model identifier. */
  model?: string;
}

/** A conversation for ingest; `conversation_id` is required. */
export interface OversightIngestConversation extends OversightConversation {
  conversation_id: string;
}

/** Options for oversight.ingest. */
export interface OversightIngestOptions {
  /**
   * Conversations to analyze and store (1 to 300). The request body is capped at
   * 512 KB, so a batch near the count limit must consist of short conversations.
   */
  conversations: OversightIngestConversation[];

  /**
   * Legacy per-request callback. The API POSTs an unsigned
   * `{ event: 'ingestion_complete', timestamp, ingestion_id, conversations_processed,
   * errors_count, high_concern_count }` here when the batch completes. The signed
   * `oversight.ingestion.complete` event is delivered to webhooks registered with
   * `client.webhooks`, never to this URL.
   */
  webhook_url?: string;

  /** Configuration options. */
  config?: OversightIngestConfig;
}

/** A change the API made to a conversation before analysis. */
export interface TruncationWarning {
  type: 'message_scaffolded' | 'message_truncated' | 'conversation_truncated';
  details: string;
}

/** Per-conversation result from ingest. */
export interface OversightIngestConversationResult {
  /** Your conversation id. */
  conversation_id: string;

  /** Overall concern level. */
  overall_concern: ConcernLevel;

  /** Number of behaviors detected. */
  behaviors_detected: number;

  /** Present when the conversation was modified before analysis. */
  truncation_warnings?: TruncationWarning[];
}

/** Per-conversation error from ingest. */
export interface OversightIngestError {
  /** Your conversation id. */
  conversation_id: string;

  /** Error message. */
  error: string;
}

/**
 * Response from POST /v1/oversight/ingest.
 *
 * Ingest is synchronous today: the call returns after every conversation is
 * analyzed, `status` is `complete` or `failed` (failed only when every
 * conversation failed), and `estimated_completion` is never set. `queued`
 * and `processing` stay in the union for forward compatibility. Billing is
 * 100 mills per conversation, deducted before analysis with no per-
 * conversation refund.
 */
export interface OversightIngestResponse {
  /** Ingestion id for tracking. */
  ingestion_id: string;

  /** Current status. */
  status: 'queued' | 'processing' | 'complete' | 'failed';

  /** Number of conversations received. */
  conversations_received: number;

  /** Number of conversations processed. */
  conversations_processed: number;

  /** Reserved; never set by the synchronous implementation. */
  estimated_completion?: string;

  /** Dashboard URL for the results. */
  dashboard_url: string;

  /** Per-conversation results (present when at least one succeeded). */
  results?: OversightIngestConversationResult[];

  /** Per-conversation errors (present when at least one failed). */
  errors?: OversightIngestError[];
}

// =============================================================================
// Ocular (behavioral risk assessment: POST /v1/ocular)
// =============================================================================
//
// Models the post-filter customer surface the gateway emits. Individual
// head-code identifiers are stripped upstream; only the demo route exposes
// them, under public family names.

/** Ensemble depth. `fast` is single-variant; `thorough` populates `stability`. */
export type OcularThoroughness = 'fast' | 'auto' | 'thorough';

/** Per-axis level. */
export type OcularLevel = 'critical' | 'high' | 'moderate' | 'low' | 'minimal';

/** Per-turn phase label in `trajectory_shape.phases`. */
export type OcularPhase = 'baseline' | 'emerging' | 'escalating' | 'de-escalating' | 'crisis';

/** Options for client.ocular(). Either `messages` or `text` is required. */
export interface OcularOptions {
  /** Conversation messages (roles user|assistant). The demo route accepts at most 12. */
  messages?: Message[];

  /** Plain text input (alternative to messages; demo route caps at 4,000 characters). */
  text?: string;

  /** Ensemble depth. Omit for the server default (`auto`). */
  thoroughness?: OcularThoroughness;

  /**
   * Score the conversation turn by turn and return `trajectory` (one entry
   * per scored turn; `turn` is the 0-based position in `messages`) and
   * `trajectory_shape`. Off by default; without it the response carries
   * neither field. Which turns are scored depends on `trajectory_stride`.
   * The demo route returns `trajectory` but never `trajectory_shape`.
   */
  per_turn?: boolean;

  /**
   * With per_turn: score every Nth turn, counted backward from the last
   * turn so the final turn is always scored (1..64). The server default is
   * 3, so a 5-message conversation yields turns 4 and 1. Pass 1 to score
   * every turn.
   */
  trajectory_stride?: number;

  /** Opaque end-user id (1..256 chars) for dashboard analytics. Never forwarded to the model. */
  user_id?: string;

  /** Opaque session id (1..256 chars) for dashboard analytics. Never forwarded to the model. */
  session_id?: string;

  /** Opaque agent id (1..256 chars) for dashboard analytics. Never forwarded to the model. */
  agent_id?: string;
}

/** Per-axis output: level plus raw score in [0, 1]. */
export interface OcularAxis {
  level: OcularLevel;
  score: number;
}

export type OcularAxisGroup = Record<string, OcularAxis>;

/**
 * Per-axis signal groups.
 *
 * `user` carries 8 axes: suicide, self_harm, harm_to_others, abuse,
 * sexual_violence, exploitation, stalking, self_neglect.
 *
 * `ai` carries 4 axes: harm_provision, emotional_failure, manipulation,
 * safeguarding_failure.
 */
export interface OcularSignals {
  user: OcularAxisGroup;
  ai: OcularAxisGroup;
}

/**
 * Per-axis stability in [0, 1] across the variants Ocular ran (higher = more
 * consistent). Present only on multi-variant calls; otherwise `null`.
 */
export interface OcularStability {
  user: Record<string, number>;
  ai: Record<string, number>;
  imminence: number;
}

/** Per-turn trajectory entry (only with `per_turn: true`). */
export interface OcularTrajectoryEntry {
  /** 0-based position of the turn in `messages` (for `text` input, of the parsed speaker turn). */
  turn: number;

  /**
   * Speaker of the turn: `user` or `assistant` (the gateway maps the
   * upstream `ai` label to `assistant`). Declared as string because any
   * other upstream label passes through unchanged.
   */
  role: string;

  /** Per-turn salience, same cascade as the top-level field. */
  salience: number;

  /**
   * Per-turn axis scores keyed by the public axis vocabulary: user axes by
   * bare name (`suicide`), AI axes prefixed (`ai_manipulation`), plus the
   * `fiction` and `genuine` context scalars. Absent when the turn had none.
   */
  signals_by_axis?: Record<string, number>;
}

/**
 * Arc summary of a per-turn trajectory (only with `per_turn: true`). The
 * phase, slope and peak fields track the suicide (crisis) axis and index
 * the `trajectory` array (entry i, not message i); `onsets` spans every
 * axis and uses `turn` values. The authenticated route returns it whenever
 * at least one turn was scored; the demo route never returns it. Every key
 * is optional.
 */
export interface OcularTrajectoryShape {
  /** axis -> the `turn` value (0-based message position) at which that axis first crossed its onset threshold. */
  onsets?: Record<string, number>;

  /** Phase label per `trajectory` entry: `phases[i]` describes `trajectory[i]`. */
  phases?: OcularPhase[];

  /** Crisis-axis slope per `trajectory` entry: the delta versus the previous scored turn; the first is 0. */
  slopes?: number[];

  /**
   * Position in the `trajectory` array of the entry with the highest
   * crisis-axis score; `trajectory[peak_turn].turn` is the message index.
   */
  peak_turn?: number;

  /** Highest crisis-axis score across the scored turns. */
  peak_crisis?: number;
}

/** Response metadata. `windowed` and `windows` are always present (`false`, `1` for unwindowed input). */
export interface OcularMeta {
  /** Ocular model build identifier. */
  version: string;

  /** Upstream inference time (ms). */
  inference_ms: number;

  /** Whether the input was split into windows at the gateway. */
  windowed?: boolean;

  /** Number of windows the input was split into. */
  windows?: number;

  /** True if any window's content was truncated to fit. */
  truncated?: boolean;
}

/**
 * Response from POST /v1/ocular ($0.0001 per call).
 *
 * Decisions key off the continuous `salience` score in [0, 1] plus the axes
 * under `signals.user` (8) and `signals.ai` (4). Reference cutoffs are
 * T_WATCH = 0.30 and T_DANGER = 0.60 (docs.nope.net/ocular). `fiction` and
 * `authenticity` are context modulators already factored into `salience`.
 * `trajectory` and `trajectory_shape` are present only when the request set
 * `per_turn: true`.
 */
export interface OcularResponse {
  /** Continuous severity score in [0, 1]. */
  salience: number;

  /** Who the speaker-side risk pertains to ('self', 'other', 'unknown'). */
  subject: string;

  /** How urgent the concern is (a separate axis). */
  imminence: OcularAxis;

  /** Roleplay or fiction-framing strength in [0, 1]. */
  fiction: number;

  /** Authenticity-of-distress signal in [0, 1]. */
  authenticity: number;

  /** 8 user-risk axes and 4 AI-behavior axes. */
  signals: OcularSignals;

  /** Which ensemble depth ran. */
  thoroughness: OcularThoroughness;

  /** Aggregate confidence across variants; null on single-variant calls. */
  confidence: number | null;

  /** Per-axis stability across variants; null on single-variant calls. */
  stability: OcularStability | null;

  /** Response metadata. */
  meta: OcularMeta;

  /** Per-turn trail (only with `per_turn: true`): one entry per scored turn, every `trajectory_stride`-th turn back from the last. */
  trajectory?: OcularTrajectoryEntry[];

  /** Arc summary of the trail (only with `per_turn: true`; never on the demo route). */
  trajectory_shape?: OcularTrajectoryShape;
}

/** A screening head on the demo surface, under its public family name. */
export interface OcularHead {
  code: string;
  score: number;
}

/** Demo per-turn entry; may also carry the turn's screening heads. */
export interface OcularDemoTrajectoryEntry extends OcularTrajectoryEntry {
  heads?: OcularHead[];
}

/**
 * Response from POST /v1/try/ocular (demo mode). The customer fields plus
 * screening `heads` and per-head `detail.scores` / `detail.calibrated`,
 * keyed by public family names such as `USER_SUICIDE_HEAD_A`. The demo
 * route returns `trajectory` with `per_turn` but never `trajectory_shape`.
 */
export interface OcularDemoResponse extends OcularResponse {
  heads: OcularHead[];
  detail: {
    scores: Record<string, number>;
    calibrated: Record<string, number>;
  };
  trajectory?: OcularDemoTrajectoryEntry[];
}

/** Response type of ocular() for a client constructed with the given `demo` flag. */
export type OcularResponseFor<Demo extends boolean> = Demo extends true ? OcularDemoResponse : OcularResponse;
// =============================================================================
// Billing (GET /v1/billing/*)
// =============================================================================
//
// Shapes from api/src/routes/v1/billing.ts. All amounts are in mills
// (1 mill = $0.001). Shapes recaptured after API fix A-5 was deployed.

/** A top-up denomination. */
export interface BillingTopupOption {
  id: string;
  amount_mills: number;
  /** e.g. '$10'. */
  label: string;
  /** Screens this amount buys. */
  screens: number;
  /** Evaluate calls this amount buys. */
  evaluates: number;
  /** Smart signpost calls this amount buys. */
  resources_smart: number;
}

/** A past top-up. */
export interface BillingTopupRecord {
  id: string;
  amount_mills: number;
  amount_formatted: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}

/** Response from GET /v1/billing/balance. */
export interface BillingBalanceResponse {
  balance_mills: number;
  /** e.g. '$12.35'. */
  balance_formatted: string;
  /** Screens the balance covers. */
  estimated_screens: number;
  /** Evaluate calls the balance covers. */
  estimated_evaluates: number;
  /** Smart signpost calls the balance covers. */
  estimated_resources_smart: number;
  low_balance: boolean;
  topup_history: BillingTopupRecord[];
  topup_options: BillingTopupOption[];
}

/** Options for billing.usage(). Dates are ISO 8601; default is the current month. */
export interface BillingUsageOptions {
  start_date?: string;
  end_date?: string;
}

/** Per-endpoint usage line. */
export interface BillingUsageBreakdown {
  /** Endpoint key (e.g. 'evaluate', 'oversight_analyze', 'v0_screen'). */
  endpoint: string;
  calls: number;
  cost_mills: number;
  cost_formatted: string;
  /** Calls that triggered a referral. */
  referrals: number;
}

/** Response from GET /v1/billing/usage. */
export interface BillingUsageResponse {
  period_start: string;
  /** null when no end_date was given. */
  period_end: string | null;
  total_spend_mills: number;
  total_spend_formatted: string;
  breakdown: BillingUsageBreakdown[];
}

/** Options for billing.usageHistory(). */
export interface BillingUsageHistoryOptions {
  /** Page size (default 50, max 100). */
  limit?: number;
  offset?: number;
  /** Filter to one endpoint path. */
  endpoint?: string;
  start_date?: string;
  end_date?: string;
}

/** One billed call. */
export interface BillingUsageRecord {
  id: string;
  endpoint: string;
  cost_mills: number;
  cost_formatted: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/** Response from GET /v1/billing/usage/history. */
export interface BillingUsageHistoryResponse {
  records: BillingUsageRecord[];
  total: number;
  limit: number;
  offset: number;
}

/** One priced endpoint. */
export interface BillingPricingEntry {
  cost_mills: number;
  /** e.g. '$0.003' or 'Free'. */
  cost_display: string;
  description?: string;
}

/** Pricing by endpoint key. Unknown keys are tolerated. */
export interface BillingPricingTable {
  evaluate: BillingPricingEntry;
  ocular: BillingPricingEntry;
  signpost_smart: BillingPricingEntry;
  resources_smart: BillingPricingEntry;
  oversight_analyze: BillingPricingEntry;
  /** Billed per conversation. */
  oversight_ingest: BillingPricingEntry;
  v0_screen: BillingPricingEntry;
  /** Alias of v0_screen. */
  screen: BillingPricingEntry;
  v0_evaluate: BillingPricingEntry;
  [endpoint: string]: BillingPricingEntry | undefined;
}

/** Response from GET /v1/billing/pricing (public, no key). */
export interface BillingPricingResponse {
  /** 'mills'. */
  unit: string;
  unit_description: string;
  pricing: BillingPricingTable;
  topup_options: BillingTopupOption[];
  free_credit_mills: number;
  free_credit_display: string;
}

/** Options for billing.topup(). */
export interface BillingTopupOptions {
  /** One of the topup_options amounts (10000, 25000, 50000, 100000). */
  amount_mills: number;
  /** Where Stripe sends the user after payment (default: the dashboard). */
  success_url?: string;
  /** Where Stripe sends the user on cancel (default: the dashboard). */
  cancel_url?: string;
}

/** Response from POST /v1/billing/topup. */
export interface BillingTopupResponse {
  /** Stripe Checkout URL to redirect the user to. */
  checkout_url: string;
}

