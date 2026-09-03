/**
 * Tripwire for the offline tiers (unit + contract): any code path that
 * reaches the global fetch instead of the injected one fails loudly, so a
 * test can never touch the network by accident.
 */

globalThis.fetch = (() => {
  throw new Error('Offline test reached global fetch. Pass `fetch` to NopeClient instead.');
}) as unknown as typeof fetch;
