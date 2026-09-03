import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/**
 * Offline tiers only: unit tests (injected fetch fakes) and contract tests
 * (fixtures under tests/fixtures). The live tier has its own config
 * (vitest.live.config.ts) and never runs from `pnpm test`.
 */
export default defineConfig({
  define: {
    __NOPE_SDK_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/contract/**/*.test.ts'],
    environment: 'node',
    // One worker at a time: this suite runs on a memory-constrained box.
    fileParallelism: false,
    maxConcurrency: 1,
  },
});
