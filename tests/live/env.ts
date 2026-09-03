/**
 * Live-tier environment: opt-in gate, API key loader, cost ledger.
 *
 * The key is never printed, logged or embedded in an assertion message.
 * Resolution order:
 *   1. NOPE_E2E_API_KEY (CI secret or shell export)
 *   2. NOPE_DEDICATED_CI_KEY from ../api/.env when that file exists (the
 *      founder's local checkout layout)
 */

import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

export const API_URL = (process.env.NOPE_API_URL ?? 'https://api.nope.net').replace(/\/+$/, '');

/** SMOKE=1 selects the nightly smoke subset (audit 5.3). */
export const SMOKE = process.env.SMOKE === '1';

/** Demo evaluate calls share a 10/min per-IP bucket; the whole run stays under this. */
export const MAX_DEMO_EVALUATE_CALLS = 8;

export function liveEnabled(): boolean {
  return process.env.NOPE_LIVE === '1';
}

export function loadApiKey(): string | undefined {
  const fromEnv = process.env.NOPE_E2E_API_KEY;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();

  const envFile = resolve(REPO_ROOT, '..', 'api', '.env');
  if (!existsSync(envFile)) return undefined;
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?NOPE_DEDICATED_CI_KEY\s*=\s*(.+?)\s*$/);
    if (m) {
      const value = m[1].replace(/^(['"])(.*)\1$/, '$2').trim();
      if (value) return value;
    }
  }
  return undefined;
}

/** Where test files append their spend; global-setup sums it at the end. */
export function ledgerPath(): string {
  return process.env.NOPE_LIVE_COST_LEDGER ?? join(tmpdir(), 'nope-node-sdk-live-cost.ledger');
}

export function appendLedger(file: string, mills: number): void {
  appendFileSync(ledgerPath(), `${file}\t${mills}\n`);
}
