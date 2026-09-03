/**
 * Per-file live setup: flush the file's accumulated spend to the ledger.
 */

import { afterAll } from 'vitest';
import { flushCost } from './helpers.js';

afterAll(() => {
  flushCost();
});
