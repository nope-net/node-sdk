/**
 * Live-tier global setup: refuses to start without NOPE_LIVE=1 and a key,
 * seeds the cost ledger, and prints the run's total spend at the end.
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { API_URL, SMOKE, liveEnabled, loadApiKey } from './env.js';

export async function setup(): Promise<() => void> {
  if (!liveEnabled()) {
    throw new Error(
      'The live suite is opt-in: run `NOPE_LIVE=1 pnpm test:live` (or `NOPE_LIVE=1 pnpm test:live:smoke`). ' +
        'It spends real balance against ' +
        API_URL +
        '.'
    );
  }
  if (!loadApiKey()) {
    throw new Error(
      'No API key: set NOPE_E2E_API_KEY, or provide ../api/.env with NOPE_DEDICATED_CI_KEY. The key is never logged.'
    );
  }

  const ledger = join(tmpdir(), `nope-node-sdk-live-cost-${process.pid}.ledger`);
  process.env.NOPE_LIVE_COST_LEDGER = ledger;
  writeFileSync(ledger, '');
  console.log(`[live] target ${API_URL}; mode ${SMOKE ? 'smoke' : 'full'}; key loaded (not shown)`);

  return () => {
    let total = 0;
    const perFile: Record<string, number> = {};
    if (existsSync(ledger)) {
      for (const line of readFileSync(ledger, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        const [file, mills] = line.split('\t');
        const n = Number(mills);
        if (!Number.isFinite(n)) continue;
        total += n;
        perFile[file] = (perFile[file] ?? 0) + n;
      }
      unlinkSync(ledger);
    }
    for (const [file, mills] of Object.entries(perFile)) {
      console.log(`[live] ${file}: ${mills} mills`);
    }
    console.log(`[live] Live run cost: ${total} mills ($${(total / 1000).toFixed(4)}) from X-Cost-Mills headers`);
  };
}
