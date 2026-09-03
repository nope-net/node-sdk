/**
 * Compile-time pins for the 4.0.0 Signpost surface, plus the generated
 * ServiceScope / Population vocabularies.
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  CrisisResource,
  CrisisResourceType,
  DetectCountryResponse,
  DetectCountryResult,
  Population,
  ServiceScope,
  SignpostConfig,
  SignpostOptions,
  SignpostSearchResult,
  SignpostSmartConfig,
  SignpostSmartResponse,
} from '../../src/index.js';
import { POPULATIONS, SERVICE_SCOPES } from '../../src/index.js';

describe('Signpost types (compile-time)', () => {
  it('signpost options take filters under config or at the top level', () => {
    expectTypeOf<SignpostConfig>().toEqualTypeOf<{
      scopes?: ServiceScope[];
      populations?: Population[];
      subdivisions?: string[];
      limit?: number;
      urgent?: boolean;
    }>();
    expectTypeOf<SignpostOptions['country']>().toEqualTypeOf<string>();
    expectTypeOf<SignpostOptions['scopes']>().toEqualTypeOf<ServiceScope[] | undefined>();
    expectTypeOf<SignpostOptions['config']>().toEqualTypeOf<SignpostConfig | undefined>();
  });

  it('smart config has no urgent; smart response gains message and try_endpoint', () => {
    expectTypeOf<SignpostSmartConfig>().toEqualTypeOf<{
      scopes?: ServiceScope[];
      populations?: Population[];
      limit?: number;
    }>();
    expectTypeOf<SignpostSmartResponse['message']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<SignpostSmartResponse['try_endpoint']>().toEqualTypeOf<boolean | undefined>();
  });

  it('search results are declared explicitly with nulls, not inherited from CrisisResource', () => {
    expectTypeOf<SignpostSearchResult['name_local']>().toEqualTypeOf<string | null>();
    expectTypeOf<SignpostSearchResult['subdivision_code']>().toEqualTypeOf<string | null>();
    expectTypeOf<SignpostSearchResult['description']>().toEqualTypeOf<string | null>();
    expectTypeOf<SignpostSearchResult['service_scopes']>().toEqualTypeOf<string[]>();
    expectTypeOf<SignpostSearchResult['similarity']>().toEqualTypeOf<number>();
    expectTypeOf<SignpostSearchResult['type']>().toEqualTypeOf<CrisisResourceType>();
    expectTypeOf<SignpostSearchResult['open_status']['next_change']>().toEqualTypeOf<string | null>();
    expectTypeOf<SignpostSearchResult>().not.toHaveProperty('service_scope');
    expectTypeOf<SignpostSearchResult>().not.toHaveProperty('resource_kind');
    expectTypeOf<SignpostSearchResult>().not.toHaveProperty('priority_tier');
    expectTypeOf<SignpostSearchResult>().not.toHaveProperty('source');
    expectTypeOf<CrisisResource['name_local']>().toEqualTypeOf<string | undefined>();
  });

  it('detectCountry types the miss and adds detected', () => {
    expectTypeOf<DetectCountryResponse>().toEqualTypeOf<{
      country_code: string;
      country_name: string;
      subdivision_code?: string;
      subdivision_name?: string;
      error?: string;
    }>();
    expectTypeOf<DetectCountryResult['detected']>().toEqualTypeOf<boolean>();
  });
});

describe('generated Signpost vocabularies', () => {
  it('has 93 service scopes and 26 populations, unique, lowercase', () => {
    expect(SERVICE_SCOPES).toHaveLength(93);
    expect(POPULATIONS).toHaveLength(26);
    expect(new Set(SERVICE_SCOPES).size).toBe(93);
    expect(new Set(POPULATIONS).size).toBe(26);
    for (const v of [...SERVICE_SCOPES, ...POPULATIONS]) expect(v).toMatch(/^[a-z_]+$/);
  });

  it('contains the documented examples and not the old wrong one', () => {
    expect(SERVICE_SCOPES).toContain('suicide');
    expect(SERVICE_SCOPES).toContain('domestic_violence');
    expect(SERVICE_SCOPES).not.toContain('suicide_prevention');
    expect(POPULATIONS).toContain('youth');
    expect(POPULATIONS).toContain('veterans');
    expect(POPULATIONS).toContain('lgbtq');
  });
});
