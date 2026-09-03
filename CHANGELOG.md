# Changelog

All notable changes to `@nope-net/sdk`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the package
follows [Semantic Versioning](https://semver.org/).

## 4.0.0 - 2026-09-03

The types now model the live wire of api.nope.net (captured fixtures under
`tests/fixtures/` are checked against every v1 response type on each run; the
deprecated `/v0/screen` shape has no live fixture), and
the client covers the webhook-management and billing routes. Several
inherited fields that no route ever returned are gone. 3.0.0 was committed
in the repository and never tagged or published; its one change (removal of
`steer()`) is listed here.

### Breaking changes

- `NopeRateLimitError.retryAfter` is in seconds (3.x reported milliseconds).
  It is read from the `Retry-After` header, else the body's
  `retry_after_seconds`.
- Error constructors take an options object:
  `new NopeError(message, { statusCode, code, responseBody })`. Every error
  carries `code` (the API's machine string when the body's `error` field is
  one) and `message` (the API's sentence when present).
- `Risk` is `{ type, subject: 'self' | 'other', severity, imminence, features? }`.
  `confidence` and `subject_confidence` are removed (never sent);
  `features` is optional (absent when empty); `RiskSubject` no longer
  includes `unknown` (the legacy screen wire keeps it as `ScreenRiskSubject`).
- `EvaluateResponse.rationale`, `speaker_severity`, `speaker_imminence` and
  `show_resources` are required. `resources` is the typed
  `EvaluateResources` (`primary: EvaluateResource`,
  `secondary: EvaluateResource[]`, both required inside it). `metadata` is
  `EvaluateMetadata` (`ResponseMetadata` is removed) with `try_endpoint?`
  and `model?` added and `access_level` / `is_admin` removed.
- Removed from `EvaluateResponse`: `communication`, `summary`, `legal_flags`,
  `protective_factors`, `confidence`, `agreement`, `crisis_resources`,
  `widget_url`, `recommended_reply`, `resource_query`, `resource_tags`,
  `reflection`, `filter_result`. Removed types: `Summary`,
  `CommunicationAssessment`, `CommunicationStyleAssessment`,
  `CommunicationStyle`, `LegalFlags`, `IPVFlags`, `SafeguardingConcernFlags`,
  `ThirdPartyThreatFlags`, `StalkingFlags`, `ProtectiveFactorsInfo`,
  `FilterResult`, `RecommendedReply`, `EvidenceGrade`. Only the legacy
  `/v0/evaluate` route emits these and the SDK has no method for it.
- Removed inputs: `EvaluateOptions.userContext` and
  `EvaluateConfig.user_country`, `locale`, `user_age_band`, `policy_id`,
  `return_assistant_reply`, `assistant_safety_mode`, `use_multiple_judges`,
  `models`. None of them is read by `/v1/evaluate`. `EvaluateConfig` is
  `{ country?, include_resources?, conversation_id?, end_user_id? }`.
- `evaluate()` and `screen()` validate before sending: 1 to 100 messages,
  roles `user` or `assistant`, non-empty text.
- `CrisisResource.source` and the `directory` value of `resource_kind` are
  removed (never emitted). `id?`, `country_codes?` and `subdivision_codes?`
  are added.
- `ScreenResponse.resources` is `{ primary: CrisisResource; secondary: CrisisResource[] }`.
  `ScreenCrisisResourcePrimary`, `ScreenCrisisResourceSecondary`,
  `ScreenDisplayText` and `ScreenDebugInfo.raw_response` are removed.
- `OversightAnalysisResult.summary`, `pattern_assessment` and `model_used`
  are optional (fast mode omits the first two).
  `OversightIngestConversationResult.truncation_warnings[]` items are
  `TruncationWarning = { type, details }` (was `{ type, message }`).
  `oversight.analyze` returns `OversightDemoAnalyzeResponse`
  (`{ mode, result, try_endpoint }`) on a demo client; `NopeClient` is
  generic on the demo flag (`NopeClient<Demo extends boolean = false>`) so
  that return type is selected at compile time.
- `OcularAxis.level` is the `OcularLevel` literal
  (`critical | high | moderate | low | minimal`). `OcularMeta` no longer has
  an index signature. `ocular()` routes to `/v1/try/ocular` in demo mode and
  returns `OcularDemoResponse` there (3.x sent the request to `/v1/ocular`
  without a key and got a 401).
- `SignpostSearchResult` is declared from the search wire and no longer
  extends `CrisisResource`: plural `service_scopes` and `populations`,
  `country_code`, `subdivision_code`, `resource_type`, `contacts[]`, `id`,
  explicit `null`s, and `open_status` with nullable fields. The singular
  fields it used to inherit were never on that wire.
- `SignpostConfig.scopes` and `populations` are typed with the generated
  `ServiceScope` and `Population` unions. `SignpostSmartOptions.config` is
  `SignpostSmartConfig` (`scopes`, `populations`, `limit`; `urgent` was
  accepted and never sent).
- `detectCountry()` returns `DetectCountryResult`, the wire response plus
  `detected: boolean`.
- `signpost()`, `signpostSearch()`, `screen()`, `oversight.ingest()`,
  `webhooks.*` and `billing.*` throw on a demo client. 3.x sent
  `signpost()` and `signpostSearch()` without a key.
- The `Resources*` types are deprecated aliases of the `Signpost*` types
  (3.x had it the other way round). `resources()`, `resourcesSmart()`,
  `resourceById()` and `resourcesCountries()` log a one-time deprecation
  warning naming the 2027-01-01 sunset.
- `WebhookEventType` is
  `evaluate.alert | oversight.alert | oversight.ingestion.complete | test.ping`
  (3.x declared `risk.elevated | risk.critical | test.ping`, which no
  delivery carried). `WebhookPayload` is a discriminated union of
  `EvaluateAlertPayload`, `OversightAlertPayload`,
  `OversightIngestionCompletePayload` and `TestPingPayload`; narrow on
  `event` to reach the per-event fields.
- Package layout: ESM and CommonJS builds (`dist/index.js`,
  `dist/index.cjs`) with `exports` conditions and `engines.node >= 18`.
  `main` now points at the CommonJS build.
- `client.steer()` and the Steer types are gone (the route returned 410).

### Added

- Retries: `maxRetries` (default 2) on 429 and 503 only, waiting
  `Retry-After` seconds (else the body's `retry_after_seconds`, else 1 s
  exponential), capped at 30 s per wait. Timeouts, connection errors and
  other 5xx are never retried because paid routes charge before the handler
  runs. `sleep` is injectable.
- `fetch` option on `NopeClient` for tracing or tests.
- `client.lastResponseMeta`: `{ status, rateLimit: { limit, remaining, reset }, balance: { balanceMills, costMills } }`
  from the last response's `X-RateLimit-*`, `X-Balance-Mills` and
  `X-Cost-Mills` headers.
- Errors: `NopeInsufficientBalanceError` (402: `balanceMills`,
  `requiredMills`, `formattedCurrent`, `formattedRequired`, `topupUrl`,
  `perConversationMills`, `conversations`), `NopeNotFoundError` (404),
  `NopeServiceUnavailableError` (503, subclass of `NopeServerError`, with
  `retryAfter`). 413 maps to `NopeValidationError` with `statusCode` 413;
  400 and 413 expose the body extras as `details`. A 403 carrying
  `upgrade_url` maps to `NopeFeatureError` with `feature: 'paid_plan'` and
  `upgradeUrl`. `NopeServerError.retryAfter`. `ApiErrorBody` type.
- Evaluate: `EvaluateMetadata.model` and `try_endpoint`;
  `CrisisResource.id`, `country_codes`, `subdivision_codes`.
- Oversight: request `bot_context`, `config.mode` (`full | fast`),
  `behaviors` filter (`enabled`, `disabled`, `min_severity`, `categories`)
  with client-side exclusivity and severity checks; result `mode_used`,
  `filter_applied`, `windows` (with `message_range` and
  `conversation_turn_range`), `concern_progression`, `peak_concern`,
  `final_concern`, `inflection_points`, `context_for_next_window`,
  `narrative_summary`, `AggregatedBehavior.recommendation`; ingest cap
  raised to 300. Generated `OversightBehaviorCode` (91) and
  `OversightBehaviorCategory` (14) unions with the matching constant arrays.
- Ocular: request `per_turn`, `trajectory_stride`, `user_id`, `session_id`,
  `agent_id`; response `trajectory[].signals_by_axis` and
  `trajectory_shape`; `OcularDemoResponse` with `heads` and `detail`.
- Signpost: filters accepted at the top level of `signpost()` as well as
  under `config`; `subdivisions`; `SignpostSmartResponse.message` and
  `try_endpoint`; `detectCountry({ countryHint })` sending `x-country`;
  `DetectCountryResponse.subdivision_code` and `subdivision_name`; generated
  `ServiceScope` (93) and `Population` (26) unions with `SERVICE_SCOPES` and
  `POPULATIONS`.
- Webhooks: `Webhook.verifyRequest(body, headers, secret, options?)` reads
  the signature and timestamp headers from a Node request, a fetch
  `Headers` or a plain map and returns `{ payload, eventId, webhookId, eventType }`;
  `verify` and `sign` accept bytes (`Buffer`, `Uint8Array`) and run the HMAC
  over raw UTF-8.
- `client.webhooks.{create, list, get, update, delete, regenerateSecret, test, events}`.
  `test()` returns the `WebhookDeliveryResult` on a 502 instead of throwing.
- `client.billing.{balance, usage, usageHistory, pricing, topup}`.
- `SDK_VERSION` export; `User-Agent` is `nope-node/<package version>`.

### Fixed

- Demo `evaluate()` sends `config.country`, mirrored as `config.user_country`
  (the older spelling the `/v1/try/evaluate` route accepts when `country` is
  absent). 3.x dropped the country on that route.
- Docstrings no longer mention `nope_test_` keys, describe `trajectory` as
  present only with `per_turn`, price Ocular at $0.0001 per call, and use
  scope values the API accepts.

## 2.3.1 and earlier

See the git history. 2.3.0 is the last version on npm before 4.0.0.
