/**
 * Contract tests: every fixture under tests/fixtures/** (except webhooks/ and
 * headers/) must
 *
 *   1. compile against the SDK response type with no cast (the generated
 *      mirror in ./generated/ carries `satisfies <Type>`; `pnpm typecheck`
 *      enforces it), and
 *   2. pass the runtime checks below (required keys, enum membership).
 *
 * The first test also asserts that each generated mirror deep-equals the JSON
 * it was generated from, so a stale mirror fails here rather than silently
 * checking an old shape.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { listFixtures, moduleNameFor } from '../../scripts/generate-fixture-modules.js';

import evaluateAuthBenign from './generated/evaluate.auth.benign.js';
import evaluateTryGb from './generated/evaluate.try.gb.js';
import evaluateTryUs from './generated/evaluate.try.us.js';
import evaluateTryGbNoResources from './generated/evaluate.try.gb.no-resources.js';
import evaluateTryGbText from './generated/evaluate.try.gb.text.js';
import oversightAuthFast from './generated/oversight.auth.fast.js';
import oversightTryFast from './generated/oversight.try.fast.js';
import oversightTryFull from './generated/oversight.try.full.js';
import ocularAuth from './generated/ocular.auth.js';
import ocularTry from './generated/ocular.try.js';
import ocularAuthPerTurn from './generated/ocular.auth.per-turn.js';
import signpostAuthGb from './generated/signpost.auth.gb.js';
import signpostTrySmart from './generated/signpost.try.smart.js';
import signpostSearchAuth from './generated/signpost.search.auth.js';
import signpostSearchAuthMixedContacts from './generated/signpost.search.auth.mixed-contacts.js';
import signpostCountries from './generated/signpost.countries.js';
import signpostDetectMiss from './generated/signpost.detect-country.miss.js';
import signpostById from './generated/signpost.by-id.js';
import billingBalance from './generated/billing.balance.js';
import billingUsage from './generated/billing.usage.js';
import billingPricing from './generated/billing.pricing.js';
import error400Empty from './generated/errors.400.evaluate-empty.js';
import error400Role from './generated/errors.400.evaluate-role.js';
import error400Scope from './generated/errors.400.signpost-scope.js';
import error401 from './generated/errors.401.missing-auth.js';
import error404 from './generated/errors.404.signpost-id.js';
import error413 from './generated/errors.413.payload-too-large.js';

const GENERATED: Record<string, unknown> = {
  'evaluate/auth.benign.json': evaluateAuthBenign,
  'evaluate/try.gb.json': evaluateTryGb,
  'evaluate/try.us.json': evaluateTryUs,
  'evaluate/try.gb.no-resources.json': evaluateTryGbNoResources,
  'evaluate/try.gb.text.json': evaluateTryGbText,
  'oversight/auth.fast.json': oversightAuthFast,
  'oversight/try.fast.json': oversightTryFast,
  'oversight/try.full.json': oversightTryFull,
  'ocular/auth.json': ocularAuth,
  'ocular/try.json': ocularTry,
  'ocular/auth.per-turn.json': ocularAuthPerTurn,
  'signpost/auth.gb.json': signpostAuthGb,
  'signpost/try.smart.json': signpostTrySmart,
  'signpost/search.auth.json': signpostSearchAuth,
  'signpost/search.auth.mixed-contacts.json': signpostSearchAuthMixedContacts,
  'signpost/countries.json': signpostCountries,
  'signpost/detect-country.miss.json': signpostDetectMiss,
  'signpost/by-id.json': signpostById,
  'billing/balance.json': billingBalance,
  'billing/usage.json': billingUsage,
  'billing/pricing.json': billingPricing,
  'errors/400.evaluate-empty.json': error400Empty,
  'errors/400.evaluate-role.json': error400Role,
  'errors/400.signpost-scope.json': error400Scope,
  'errors/401.missing-auth.json': error401,
  'errors/404.signpost-id.json': error404,
  'errors/413.payload-too-large.json': error413,
};

const FIXTURE_ROOT = new URL('../fixtures/', import.meta.url);

function loadJson(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(rel, FIXTURE_ROOT), 'utf8')) as Record<string, unknown>;
}

// Enum vocabularies (mirroring the SDK literal unions).
const SEVERITIES = ['none', 'mild', 'moderate', 'high', 'critical'];
const IMMINENCES = ['not_applicable', 'chronic', 'subacute', 'urgent', 'emergency'];
const RISK_TYPES = [
  'suicide',
  'self_harm',
  'self_neglect',
  'violence',
  'abuse',
  'sexual_violence',
  'neglect',
  'exploitation',
  'stalking',
];
const RESOURCE_TYPES = [
  'emergency_number',
  'crisis_line',
  'text_line',
  'chat_service',
  'support_service',
  'reporting_portal',
  'online_resource',
];
const RESOURCE_KINDS = ['helpline', 'reporting_portal', 'self_help_site'];
const CONCERN_LEVELS = ['none', 'low', 'medium', 'high', 'critical'];
const TRAJECTORIES = ['improving', 'stable', 'worsening'];
const OVERSIGHT_SEVERITIES = ['low', 'medium', 'high', 'critical'];
const OCULAR_LEVELS = ['critical', 'high', 'moderate', 'low', 'minimal'];
const OCULAR_USER_AXES = [
  'suicide',
  'self_harm',
  'harm_to_others',
  'abuse',
  'sexual_violence',
  'exploitation',
  'stalking',
  'self_neglect',
];
const OCULAR_AI_AXES = ['harm_provision', 'emotional_failure', 'manipulation', 'safeguarding_failure'];

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => v as Obj;
const asArr = (v: unknown): Obj[] => v as Obj[];

function expectKeys(obj: unknown, keys: string[]): void {
  for (const k of keys) expect(obj, `missing key ${k}`).toHaveProperty(k);
}

function checkCrisisResource(r: Obj): void {
  expect(RESOURCE_TYPES).toContain(r.type);
  expect(typeof r.name).toBe('string');
  if (r.resource_kind !== undefined) expect(RESOURCE_KINDS).toContain(r.resource_kind);
  if (r.country_codes !== undefined) expect(Array.isArray(r.country_codes)).toBe(true);
  if (r.subdivision_codes !== undefined) expect(Array.isArray(r.subdivision_codes)).toBe(true);
  expect(r).not.toHaveProperty('source');
  if (r.open_status !== undefined) {
    const os = asObj(r.open_status);
    expect([true, false, null]).toContain(os.is_open);
    expect(['high', 'low', 'none']).toContain(os.confidence);
  }
}

function checkEvaluate(body: Obj): void {
  expectKeys(body, [
    'risks',
    'rationale',
    'speaker_severity',
    'speaker_imminence',
    'show_resources',
    'request_id',
    'timestamp',
  ]);
  expect(SEVERITIES).toContain(body.speaker_severity);
  expect(IMMINENCES).toContain(body.speaker_imminence);
  expect(typeof body.show_resources).toBe('boolean');
  for (const risk of asArr(body.risks)) {
    expect(RISK_TYPES).toContain(risk.type);
    expect(['self', 'other']).toContain(risk.subject);
    expect(SEVERITIES).toContain(risk.severity);
    expect(IMMINENCES).toContain(risk.imminence);
    if (risk.features !== undefined) expect(Array.isArray(risk.features)).toBe(true);
    expect(risk).not.toHaveProperty('confidence');
    expect(risk).not.toHaveProperty('subject_confidence');
  }
  if (body.metadata !== undefined) {
    const m = asObj(body.metadata);
    expect(m.api_version).toBe('v1');
    expect(['structured', 'text_blob']).toContain(m.input_format);
  }
  if (body.resources !== undefined) {
    const res = asObj(body.resources);
    expectKeys(res, ['primary', 'secondary']);
    const primary = asObj(res.primary);
    checkCrisisResource(primary);
    expect(typeof primary.why).toBe('string');
    for (const s of asArr(res.secondary)) {
      checkCrisisResource(s);
      expect(typeof s.why).toBe('string');
    }
  }
  for (const gone of ['summary', 'communication', 'crisis_resources', 'legal_flags', 'confidence']) {
    expect(body).not.toHaveProperty(gone);
  }
}

function checkOversightResult(result: Obj): void {
  expectKeys(result, [
    'conversation_id',
    'analyzed_at',
    'conversation_summary',
    'overall_concern',
    'trajectory',
    'turn_analysis',
    'human_indicators',
    'detected_behaviors',
  ]);
  expect(CONCERN_LEVELS).toContain(result.overall_concern);
  expect(TRAJECTORIES).toContain(result.trajectory);
  if (result.mode_used !== undefined) expect(['full', 'fast']).toContain(result.mode_used);
  for (const b of asArr(result.detected_behaviors)) {
    expect(typeof b.code).toBe('string');
    expect(OVERSIGHT_SEVERITIES).toContain(b.severity);
    expect(typeof b.turn_count).toBe('number');
  }
  for (const t of asArr(result.turn_analysis)) {
    expect(t.turn_number as number).toBeGreaterThanOrEqual(1);
    expect(t.role).toBe('assistant');
    for (const b of asArr(t.behaviors)) {
      expect(OVERSIGHT_SEVERITIES).toContain(b.severity);
      expect(typeof b.evidence).toBe('string');
    }
  }
  if (result.mode_used === 'fast') {
    expect(result.trajectory).toBe('stable');
    expect(result.turn_analysis).toEqual([]);
    expect(result).not.toHaveProperty('summary');
    expect(result).not.toHaveProperty('pattern_assessment');
  }
}

function checkOversightAuth(body: Obj): void {
  expectKeys(body, ['result', 'strategy', 'strategy_reason']);
  expect(['single', 'sliding']).toContain(body.strategy);
  expect(body).not.toHaveProperty('mode');
  checkOversightResult(asObj(body.result));
}

function checkOversightDemo(body: Obj): void {
  expectKeys(body, ['mode', 'result', 'try_endpoint']);
  expect(['single', 'fast']).toContain(body.mode);
  expect(body.try_endpoint).toBe(true);
  expect(body).not.toHaveProperty('strategy');
  checkOversightResult(asObj(body.result));
}

function checkOcular(body: Obj, demo: boolean): void {
  expectKeys(body, [
    'salience',
    'subject',
    'imminence',
    'fiction',
    'authenticity',
    'signals',
    'thoroughness',
    'confidence',
    'stability',
    'meta',
  ]);
  const salience = body.salience as number;
  expect(salience).toBeGreaterThanOrEqual(0);
  expect(salience).toBeLessThanOrEqual(1);
  expect(OCULAR_LEVELS).toContain(asObj(body.imminence).level);
  const signals = asObj(body.signals);
  expect(Object.keys(asObj(signals.user)).sort()).toEqual([...OCULAR_USER_AXES].sort());
  expect(Object.keys(asObj(signals.ai)).sort()).toEqual([...OCULAR_AI_AXES].sort());
  for (const group of [asObj(signals.user), asObj(signals.ai)]) {
    for (const axis of Object.values(group)) {
      expect(OCULAR_LEVELS).toContain(asObj(axis).level);
      expect(typeof asObj(axis).score).toBe('number');
    }
  }
  expect(['fast', 'auto', 'thorough']).toContain(body.thoroughness);
  const meta = asObj(body.meta);
  expect(typeof meta.version).toBe('string');
  expect(typeof meta.windowed).toBe('boolean');
  expect(typeof meta.windows).toBe('number');
  for (const gone of ['verdict', 'axis_key', 'calibrated', 'composites']) {
    expect(body).not.toHaveProperty(gone);
  }
  if (demo) {
    expect(Array.isArray(body.heads)).toBe(true);
    const detail = asObj(body.detail);
    expect(typeof detail.scores).toBe('object');
    expect(typeof detail.calibrated).toBe('object');
  } else {
    expect(body).not.toHaveProperty('heads');
    expect(body).not.toHaveProperty('detail');
  }
}

function checkSignpostById(body: Obj): void {
  const r = body.resource as Obj;
  checkCrisisResource(r);
  expect(typeof r.id).toBe('string');
}

function checkSignpostBasic(body: Obj): void {
  expectKeys(body, ['country', 'resources', 'count']);
  expect(body.count).toBe(asArr(body.resources).length);
  for (const r of asArr(body.resources)) checkCrisisResource(r);
}

function checkSignpostSmart(body: Obj): void {
  expectKeys(body, ['country', 'query', 'ranked', 'count']);
  expect(body.count).toBe(asArr(body.ranked).length);
  for (const item of asArr(body.ranked)) {
    expectKeys(item, ['resource', 'why', 'rank']);
    checkCrisisResource(asObj(item.resource));
    expect(typeof item.rank).toBe('number');
  }
}

function checkSignpostSearch(body: Obj): void {
  expectKeys(body, ['query', 'country', 'results', 'count', 'timing']);
  expectKeys(body.timing, ['embed_ms', 'search_ms', 'total_ms']);
  for (const r of asArr(body.results)) {
    expectKeys(r, [
      'id',
      'name',
      'country_code',
      'country_codes',
      'subdivision_codes',
      'service_scopes',
      'populations',
      'resource_type',
      'contacts',
      'is_24_7',
      'languages',
      'similarity',
      'type',
      'open_status',
    ]);
    const sim = r.similarity as number;
    expect(sim).toBeGreaterThanOrEqual(0);
    expect(sim).toBeLessThanOrEqual(1);
    expect(RESOURCE_TYPES).toContain(r.type);
    expect(Array.isArray(r.contacts)).toBe(true);
  }
}

function checkCountries(body: Obj): void {
  expectKeys(body, ['countries', 'count']);
  expect(body.count).toBe((body.countries as string[]).length);
  expect(body.countries).toContain('US');
}

function checkDetectCountry(body: Obj): void {
  expectKeys(body, ['country_code', 'country_name']);
  expect(typeof body.country_code).toBe('string');
}

function checkBillingBalance(body: Obj): void {
  expectKeys(body, ['balance_mills', 'balance_formatted', 'low_balance', 'topup_history', 'topup_options']);
  for (const o of asArr(body.topup_options)) expectKeys(o, ['id', 'amount_mills', 'label']);
}

function checkBillingUsage(body: Obj): void {
  expectKeys(body, ['period_start', 'period_end', 'total_spend_mills', 'total_spend_formatted', 'breakdown']);
  for (const b of asArr(body.breakdown)) expectKeys(b, ['endpoint', 'calls', 'cost_mills', 'cost_formatted']);
}

function checkBillingPricing(body: Obj): void {
  expectKeys(body, ['unit', 'unit_description', 'pricing', 'topup_options', 'free_credit_mills']);
  expect(body.unit).toBe('mills');
  for (const entry of Object.values(asObj(body.pricing))) {
    expect(typeof asObj(entry).cost_display).toBe('string');
  }
}

function checkErrorBody(body: Obj): void {
  expect(typeof body.error).toBe('string');
}

const CHECKS: Record<string, (body: Obj) => void> = {
  'evaluate/auth.benign.json': checkEvaluate,
  'evaluate/try.gb.json': checkEvaluate,
  'evaluate/try.us.json': checkEvaluate,
  'evaluate/try.gb.no-resources.json': checkEvaluate,
  'evaluate/try.gb.text.json': checkEvaluate,
  'oversight/auth.fast.json': checkOversightAuth,
  'oversight/try.fast.json': checkOversightDemo,
  'oversight/try.full.json': checkOversightDemo,
  'ocular/auth.json': (b) => checkOcular(b, false),
  'ocular/try.json': (b) => checkOcular(b, true),
  'ocular/auth.per-turn.json': (b) => checkOcular(b, false),
  'signpost/auth.gb.json': checkSignpostBasic,
  'signpost/try.smart.json': checkSignpostSmart,
  'signpost/search.auth.json': checkSignpostSearch,
  'signpost/search.auth.mixed-contacts.json': checkSignpostSearch,
  'signpost/countries.json': checkCountries,
  'signpost/detect-country.miss.json': checkDetectCountry,
  'signpost/by-id.json': checkSignpostById,
  'billing/balance.json': checkBillingBalance,
  'billing/usage.json': checkBillingUsage,
  'billing/pricing.json': checkBillingPricing,
  'errors/400.evaluate-empty.json': checkErrorBody,
  'errors/400.evaluate-role.json': checkErrorBody,
  'errors/400.signpost-scope.json': checkErrorBody,
  'errors/401.missing-auth.json': checkErrorBody,
  'errors/404.signpost-id.json': checkErrorBody,
  'errors/413.payload-too-large.json': checkErrorBody,
};

describe('contract fixtures', () => {
  const fixtures = listFixtures();

  it('every fixture has a generated mirror and a runtime check', () => {
    expect(fixtures.length).toBeGreaterThan(0);
    expect(Object.keys(GENERATED).sort()).toEqual(fixtures);
    expect(Object.keys(CHECKS).sort()).toEqual(fixtures);
  });

  for (const rel of fixtures) {
    describe(rel, () => {
      it(`generated/${moduleNameFor(rel)}.ts mirrors the JSON`, () => {
        expect(GENERATED[rel]).toEqual(loadJson(rel));
      });

      it('passes the runtime shape check', () => {
        CHECKS[rel](loadJson(rel));
      });
    });
  }
});
