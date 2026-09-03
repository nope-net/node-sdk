/**
 * Once-per-process deprecation warnings.
 *
 * Each distinct message is written to console.warn a single time, so a hot
 * loop over a deprecated method does not flood the logs.
 */

const warned = new Set<string>();

/** Emit `message` through console.warn the first time it is seen. */
export function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[NOPE SDK] ${message}`);
}

/** Test hook: forget every warning issued so far. Not part of the public API. */
export function _resetDeprecationWarningsForTests(): void {
  warned.clear();
}
