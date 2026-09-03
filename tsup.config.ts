import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

// The package version is the single source for the SDK version string.
// tsup inlines it into src/version.ts at build; vitest.config.ts does the
// same for tests, so there is no generated file to drift.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node18',
  platform: 'node',
  outDir: 'dist',
  define: {
    __NOPE_SDK_VERSION__: JSON.stringify(pkg.version),
  },
});
