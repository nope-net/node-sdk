/**
 * Compile-time pins for the 4.0.0 Evaluate and screen types. expectTypeOf
 * assertions are checked by `pnpm typecheck` (tests are in the typecheck
 * project); the runtime body only exercises the utilities.
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  CrisisResource,
  EvaluateConfig,
  EvaluateMetadata,
  EvaluateOptions,
  EvaluateResource,
  EvaluateResources,
  EvaluateResponse,
  Risk,
  RiskSubject,
  ScreenConfig,
  ScreenDebugInfo,
  ScreenResponse,
  ScreenRisk,
} from '../../src/index.js';
import {
  calculateSpeakerImminence,
  calculateSpeakerSeverity,
  hasThirdPartyRisk,
  SEVERITY_SCORES,
  IMMINENCE_SCORES,
} from '../../src/index.js';

describe('Evaluate types (compile-time)', () => {
  it('Risk is {type, subject: self|other, severity, imminence, features?}', () => {
    expectTypeOf<Risk>().toEqualTypeOf<{
      type: Risk['type'];
      subject: 'self' | 'other';
      severity: Risk['severity'];
      imminence: Risk['imminence'];
      features?: string[];
    }>();
    expectTypeOf<RiskSubject>().toEqualTypeOf<'self' | 'other'>();
  });

  it('EvaluateResponse has the v1 required fields and none of the v0 ones', () => {
    expectTypeOf<EvaluateResponse['rationale']>().toEqualTypeOf<string>();
    expectTypeOf<EvaluateResponse['show_resources']>().toEqualTypeOf<boolean>();
    expectTypeOf<EvaluateResponse['speaker_severity']>().toEqualTypeOf<Risk['severity']>();
    expectTypeOf<EvaluateResponse['resources']>().toEqualTypeOf<EvaluateResources | undefined>();
    expectTypeOf<EvaluateResources>().toEqualTypeOf<{ primary: EvaluateResource; secondary: EvaluateResource[] }>();
    expectTypeOf<EvaluateResource['why']>().toEqualTypeOf<string>();
    expectTypeOf<EvaluateResponse>().not.toHaveProperty('summary');
    expectTypeOf<EvaluateResponse>().not.toHaveProperty('communication');
    expectTypeOf<EvaluateResponse>().not.toHaveProperty('crisis_resources');
    expectTypeOf<EvaluateResponse>().not.toHaveProperty('legal_flags');
    expectTypeOf<EvaluateResponse>().not.toHaveProperty('confidence');
    expectTypeOf<EvaluateResponse>().not.toHaveProperty('recommended_reply');
    expectTypeOf<EvaluateResponse>().not.toHaveProperty('filter_result');
  });

  it('EvaluateMetadata carries model and try_endpoint, not access_level/is_admin', () => {
    expectTypeOf<EvaluateMetadata['api_version']>().toEqualTypeOf<'v1'>();
    expectTypeOf<EvaluateMetadata['model']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<EvaluateMetadata['try_endpoint']>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<EvaluateMetadata>().not.toHaveProperty('access_level');
    expectTypeOf<EvaluateMetadata>().not.toHaveProperty('is_admin');
  });

  it('EvaluateConfig is {country?, include_resources?, conversation_id?, end_user_id?}', () => {
    expectTypeOf<EvaluateConfig>().toEqualTypeOf<{
      country?: string;
      include_resources?: boolean;
      conversation_id?: string;
      end_user_id?: string;
    }>();
    expectTypeOf<EvaluateOptions>().not.toHaveProperty('userContext');
    expectTypeOf<EvaluateOptions>().not.toHaveProperty('proposedResponse');
  });

  it('CrisisResource gains id/country_codes/subdivision_codes and drops source', () => {
    expectTypeOf<CrisisResource['id']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<CrisisResource['country_codes']>().toEqualTypeOf<string[] | undefined>();
    expectTypeOf<CrisisResource['subdivision_codes']>().toEqualTypeOf<string[] | undefined>();
    expectTypeOf<CrisisResource>().not.toHaveProperty('source');
    expectTypeOf<NonNullable<CrisisResource['resource_kind']>>().toEqualTypeOf<
      'helpline' | 'reporting_portal' | 'self_help_site'
    >();
  });

  it('Screen types: CrisisResource-backed resources, no display_text, no raw_response', () => {
    expectTypeOf<NonNullable<ScreenResponse['resources']>>().toEqualTypeOf<{
      primary: CrisisResource;
      secondary: CrisisResource[];
    }>();
    expectTypeOf<ScreenDebugInfo>().toEqualTypeOf<{ model: string; latency_ms: number }>();
    expectTypeOf<ScreenConfig>().toEqualTypeOf<{ country?: string; debug?: boolean; include_recommended_reply?: boolean }>();
    expectTypeOf<ScreenRisk['subject']>().toEqualTypeOf<'self' | 'other' | 'unknown'>();
    expectTypeOf<ScreenRisk['confidence']>().toEqualTypeOf<number>();
  });

  it('utilities keep working without subject_confidence', () => {
    const risks: Risk[] = [
      { type: 'suicide', subject: 'self', severity: 'moderate', imminence: 'subacute' },
      { type: 'abuse', subject: 'other', severity: 'high', imminence: 'urgent', features: ['x'] },
    ];
    expect(calculateSpeakerSeverity(risks)).toBe('moderate');
    expect(calculateSpeakerImminence(risks)).toBe('subacute');
    expect(hasThirdPartyRisk(risks)).toBe(true);
    expect(calculateSpeakerSeverity([])).toBe('none');
    expect(calculateSpeakerImminence([])).toBe('not_applicable');
    expect(SEVERITY_SCORES.critical).toBe(4);
    expect(IMMINENCE_SCORES.emergency).toBe(4);
  });
});
