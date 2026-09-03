/** Public and maintainer-facing claims that must track the deployed API. */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NopeError } from '../../src/errors.js';

const read = (relativePath: string) =>
  readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

describe('documentation contract', () => {
  it('documents Oversight limits and storage by route', () => {
    const readme = read('README.md');
    const client = read('src/client.ts');
    const types = read('src/types.ts');
    const readmeProse = readme.replace(/\s+/g, ' ');

    expect(readmeProse).toContain('91 behavior codes: 87 harmful and 4 appropriate');
    expect(readmeProse).toContain('request body is capped at 5 MB');
    expect(readme).not.toContain('91 harmful behaviours');
    expect(readme).not.toContain('request body is capped at 512 KB');
    expect(client).not.toContain('nothing is stored');
    expect(client).toContain('conversation content or full results to');
    expect(types).toContain('* 5 MB, so a batch near the count limit');
  });

  it('does not leave deployed API ticket references in fixture documentation', () => {
    expect(read('tests/fixtures/README.md')).not.toContain('API fix A-');
    expect(read('scripts/generate-fixture-modules.ts')).not.toContain('API fix A-');
  });

  it('allows a parsed JSON error object without an error property', () => {
    const error = new NopeError('delivery failed', { body: { delivered: false } });
    expect(error.body).toEqual({ delivered: false });
  });
});
