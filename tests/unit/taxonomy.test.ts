/**
 * The committed Oversight taxonomy (src/generated/oversight-taxonomy.ts)
 * must carry the 91 codes and 14 categories the API validates against, and
 * the generator's parser must be deterministic on a representative source.
 */

import { describe, it, expect } from 'vitest';
import {
  OVERSIGHT_BEHAVIOR_CATEGORIES,
  OVERSIGHT_BEHAVIOR_CODES,
  OVERSIGHT_BEHAVIOR_CODES_BY_CATEGORY,
} from '../../src/generated/oversight-taxonomy.js';
import { parseTaxonomy, renderOversight } from '../../scripts/generate-taxonomy.js';

const EXPECTED_COUNTS: Record<string, number> = {
  crisis_response: 8,
  psychological_manipulation: 14,
  boundary_violations: 11,
  minors_protection: 9,
  memory_patterns: 5,
  identity_destabilization: 4,
  relationship_harm: 5,
  vulnerable_populations: 6,
  third_party_facilitation: 5,
  discontinuity: 5,
  grief_exploitation: 5,
  trauma_reactivation: 5,
  scope_violations: 5,
  appropriate_behaviors: 4,
};

describe('generated Oversight taxonomy', () => {
  it('has 14 categories and 91 codes', () => {
    expect(OVERSIGHT_BEHAVIOR_CATEGORIES).toHaveLength(14);
    expect(OVERSIGHT_BEHAVIOR_CODES).toHaveLength(91);
  });

  it('matches the per-category counts of the API taxonomy', () => {
    const counts = Object.fromEntries(
      Object.entries(OVERSIGHT_BEHAVIOR_CODES_BY_CATEGORY).map(([k, v]) => [k, v.length])
    );
    expect(counts).toEqual(EXPECTED_COUNTS);
  });

  it('has no duplicate codes and every code is a lowercase identifier', () => {
    expect(new Set(OVERSIGHT_BEHAVIOR_CODES).size).toBe(OVERSIGHT_BEHAVIOR_CODES.length);
    for (const code of OVERSIGHT_BEHAVIOR_CODES) expect(code).toMatch(/^[a-z_]+$/);
  });

  it('contains the codes seen in the captured fixtures', () => {
    for (const code of [
      'dependency_reinforcement',
      'isolation_from_family',
      'relationship_undermining',
      'harmful_decision_validation',
    ]) {
      expect(OVERSIGHT_BEHAVIOR_CODES).toContain(code);
    }
  });
});

describe('generate-taxonomy parser', () => {
  const SAMPLE = `
export type BehaviorCategory =
  | 'alpha'
  | 'beta';

export const BEHAVIOR_CODES = {
  // Alpha
  alpha: [
    'a_one',
    'a_two',
  ],
  beta: ['b_one'],
} as const;

export type BehaviorCode = typeof BEHAVIOR_CODES[BehaviorCategory][number];
`;

  it('parses the union and the code lists', () => {
    const t = parseTaxonomy(SAMPLE);
    expect(t.categories).toEqual(['alpha', 'beta']);
    expect(t.codesByCategory).toEqual({ alpha: ['a_one', 'a_two'], beta: ['b_one'] });
  });

  it('rejects a category that has no code list', () => {
    expect(() => parseTaxonomy(SAMPLE.replace("| 'beta'", "| 'beta'\n  | 'gamma'"))).toThrow(/category mismatch/);
  });

  it('renders a module that exposes the same values', () => {
    const out = renderOversight(parseTaxonomy(SAMPLE), 'sample.ts', 'abc123');
    expect(out).toContain("alpha: [\n    'a_one',\n    'a_two',\n  ],");
    expect(out).toContain('export type OversightBehaviorCode =');
    expect(out).toContain('(api abc123)');
  });
});
