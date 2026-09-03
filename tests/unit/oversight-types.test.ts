/**
 * Compile-time pins for the 4.0.0 Oversight surface (checked by
 * `pnpm typecheck`, which includes tests/).
 */

import { describe, it, expectTypeOf } from 'vitest';
import { NopeClient } from '../../src/client.js';
import type {
  AggregatedBehavior,
  InflectionPoint,
  OversightAnalyzeConfig,
  OversightAnalyzeOptions,
  OversightAnalyzeResponse,
  OversightAnalysisResult,
  OversightBehaviorCategory,
  OversightBehaviorCode,
  OversightBehaviorFilter,
  OversightDemoAnalyzeResponse,
  OversightIngestOptions,
  TruncationWarning,
  WindowAnalysis,
} from '../../src/index.js';
import { FakeFetch } from './helpers/fake-fetch.js';

describe('Oversight types (compile-time)', () => {
  it('analyze returns the demo envelope for a demo client and the auth envelope otherwise', () => {
    const auth = new NopeClient({ apiKey: 'k', fetch: new FakeFetch().fetch });
    const demo = new NopeClient({ demo: true, fetch: new FakeFetch().fetch });
    expectTypeOf(auth.oversight.analyze).returns.resolves.toEqualTypeOf<OversightAnalyzeResponse>();
    expectTypeOf(demo.oversight.analyze).returns.resolves.toEqualTypeOf<OversightDemoAnalyzeResponse>();
    expectTypeOf<OversightDemoAnalyzeResponse['mode']>().toEqualTypeOf<'single' | 'fast'>();
    expectTypeOf<OversightDemoAnalyzeResponse['try_endpoint']>().toEqualTypeOf<true>();
    expectTypeOf<OversightAnalyzeResponse['strategy']>().toEqualTypeOf<'single' | 'sliding'>();
  });

  it('config has mode and no windowed/checkpoints; behaviors uses the generated unions', () => {
    expectTypeOf<OversightAnalyzeConfig>().toEqualTypeOf<{
      strategy?: 'single' | 'sliding';
      mode?: 'full' | 'fast';
      include_raw_xml?: boolean;
      model?: string;
    }>();
    expectTypeOf<OversightAnalyzeOptions['bot_context']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<OversightBehaviorFilter>().toEqualTypeOf<{
      enabled?: OversightBehaviorCode[];
      disabled?: OversightBehaviorCode[];
      min_severity?: 'low' | 'medium' | 'high' | 'critical';
      categories?: OversightBehaviorCategory[];
    }>();
    expectTypeOf<OversightAnalyzeOptions['behaviors']>().toEqualTypeOf<OversightBehaviorFilter | undefined>();
  });

  it('result carries mode_used, filter_applied, sliding fields and optional narratives', () => {
    expectTypeOf<OversightAnalysisResult['summary']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<OversightAnalysisResult['pattern_assessment']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<OversightAnalysisResult['mode_used']>().toEqualTypeOf<'full' | 'fast' | undefined>();
    expectTypeOf<OversightAnalysisResult['filter_applied']>().toEqualTypeOf<OversightBehaviorFilter | undefined>();
    expectTypeOf<OversightAnalysisResult['windows']>().toEqualTypeOf<WindowAnalysis[] | undefined>();
    expectTypeOf<OversightAnalysisResult['inflection_points']>().toEqualTypeOf<InflectionPoint[] | undefined>();
    expectTypeOf<OversightAnalysisResult['model_used']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<AggregatedBehavior>().toEqualTypeOf<{
      code: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      turn_count: number;
      recommendation?: string;
    }>();
    expectTypeOf<WindowAnalysis['window']>().toEqualTypeOf<{
      start_turn: number;
      end_turn: number;
      message_range?: { start_index: number; end_index_exclusive: number };
      conversation_turn_range?: { start_turn: number; end_turn: number };
    }>();
    expectTypeOf<InflectionPoint>().toEqualTypeOf<{
      turn: number;
      concern_before: OversightAnalysisResult['overall_concern'];
      concern_after: OversightAnalysisResult['overall_concern'];
      trigger_behaviors: string[];
    }>();
  });

  it('ingest warnings are {type, details}', () => {
    expectTypeOf<TruncationWarning>().toEqualTypeOf<{
      type: 'message_scaffolded' | 'message_truncated' | 'conversation_truncated';
      details: string;
    }>();
    expectTypeOf<OversightIngestOptions['conversations'][number]['conversation_id']>().toEqualTypeOf<string>();
  });
});
