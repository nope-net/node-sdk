import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/**
 * Live tier: real network calls against api.nope.net. Opt-in only.
 *
 * Run with `NOPE_LIVE=1 pnpm test:live` (or `pnpm test:live:smoke` for the
 * SMOKE=1 subset). tests/live/global-setup.ts refuses to start without
 * NOPE_LIVE=1 and loads the API key without ever printing it.
 */
export default defineConfig({
  define: {
    __NOPE_SDK_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    include: ['tests/live/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['tests/live/global-setup.ts'],
    setupFiles: ['tests/live/setup.ts'],
    // Serial: the demo endpoints share per-IP buckets and Oversight is billed.
    fileParallelism: false,
    maxConcurrency: 1,
    sequence: { concurrent: false, shuffle: false },
    testTimeout: 90_000,
    hookTimeout: 30_000,
  },
});
