/**
 * Compile-time pins for the 4.0.0 Ocular surface.
 */

import { describe, it, expectTypeOf } from 'vitest';
import { NopeClient } from '../../src/client.js';
import type {
  OcularAxis,
  OcularDemoResponse,
  OcularLevel,
  OcularOptions,
  OcularPhase,
  OcularResponse,
  OcularTrajectoryEntry,
  OcularTrajectoryShape,
} from '../../src/index.js';
import { FakeFetch } from './helpers/fake-fetch.js';

describe('Ocular types (compile-time)', () => {
  it('ocular returns OcularDemoResponse for a demo client and OcularResponse otherwise', () => {
    const auth = new NopeClient({ apiKey: 'k', fetch: new FakeFetch().fetch });
    const demo = new NopeClient({ demo: true, fetch: new FakeFetch().fetch });
    expectTypeOf(auth.ocular).returns.resolves.toEqualTypeOf<OcularResponse>();
    expectTypeOf(demo.ocular).returns.resolves.toEqualTypeOf<OcularDemoResponse>();
    expectTypeOf<OcularDemoResponse['heads']>().toEqualTypeOf<{ code: string; score: number }[]>();
    expectTypeOf<OcularDemoResponse['detail']>().toEqualTypeOf<{
      scores: Record<string, number>;
      calibrated: Record<string, number>;
    }>();
  });

  it('request options carry the five new fields', () => {
    expectTypeOf<OcularOptions>().toEqualTypeOf<{
      messages?: { role: 'user' | 'assistant'; content: string; timestamp?: string }[];
      text?: string;
      thoroughness?: 'fast' | 'auto' | 'thorough';
      per_turn?: boolean;
      trajectory_stride?: number;
      user_id?: string;
      session_id?: string;
      agent_id?: string;
    }>();
  });

  it('level is the five-value literal; trajectory and shape are typed', () => {
    expectTypeOf<OcularLevel>().toEqualTypeOf<'critical' | 'high' | 'moderate' | 'low' | 'minimal'>();
    expectTypeOf<OcularAxis>().toEqualTypeOf<{ level: OcularLevel; score: number }>();
    expectTypeOf<OcularTrajectoryEntry>().toEqualTypeOf<{
      turn: number;
      role: string;
      salience: number;
      signals_by_axis?: Record<string, number>;
    }>();
    expectTypeOf<OcularPhase>().toEqualTypeOf<'baseline' | 'emerging' | 'escalating' | 'de-escalating' | 'crisis'>();
    expectTypeOf<OcularTrajectoryShape>().toEqualTypeOf<{
      onsets?: Record<string, number>;
      phases?: OcularPhase[];
      slopes?: number[];
      peak_turn?: number;
      peak_crisis?: number;
    }>();
    expectTypeOf<OcularResponse['trajectory_shape']>().toEqualTypeOf<OcularTrajectoryShape | undefined>();
    expectTypeOf<OcularResponse['meta']['windowed']>().toEqualTypeOf<boolean | undefined>();
  });
});
