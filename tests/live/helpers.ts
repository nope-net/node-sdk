/**
 * Live-tier helpers: client factories with a recording fetch (so tests can
 * see request and response headers), spend tracking from X-Cost-Mills, and
 * the smoke/full selector.
 */

import { it } from 'vitest';
import { NopeClient } from '../../src/index.js';
import type { NopeClientOptions } from '../../src/index.js';
import { API_URL, SMOKE, appendLedger, loadApiKey } from './env.js';

let costMills = 0;
let currentFile = 'unknown';

/** Add the cost of the last call on `client` to the file's running total. */
export function charge(client: { lastResponseMeta?: { balance?: { costMills: number } } }): void {
  costMills += client.lastResponseMeta?.balance?.costMills ?? 0;
}

export function setCurrentFile(name: string): void {
  currentFile = name;
}

export function flushCost(): void {
  if (costMills > 0) appendLedger(currentFile, costMills);
  costMills = 0;
}

export interface Recorded {
  requestHeaders: Record<string, string>;
  responseHeaders: Headers;
  status: number;
  url: string;
}

/** A real fetch that records every exchange (headers only; bodies untouched). */
export function recordingFetch(log: Recorded[]): NopeClientOptions['fetch'] {
  return async (input, init) => {
    const response = await fetch(input, init);
    log.push({
      requestHeaders: (init?.headers ?? {}) as Record<string, string>,
      responseHeaders: response.headers,
      status: response.status,
      url: String(input),
    });
    return response;
  };
}

export function authClient<Demo extends boolean = false>(
  extra: Partial<Omit<NopeClientOptions, 'demo'>> & { demo?: Demo } = {}
): NopeClient<Demo> {
  const apiKey = loadApiKey();
  if (!apiKey) throw new Error('live: API key not available (global-setup should have refused to start)');
  return new NopeClient<Demo>({ apiKey, baseUrl: API_URL, timeout: 60_000, ...extra });
}

export function demoClient(extra: Partial<Omit<NopeClientOptions, 'demo'>> = {}): NopeClient<true> {
  return new NopeClient({ demo: true, baseUrl: API_URL, timeout: 60_000, ...extra });
}

export function publicClient(extra: Partial<Omit<NopeClientOptions, 'demo'>> = {}): NopeClient {
  return new NopeClient({ baseUrl: API_URL, timeout: 60_000, ...extra });
}

/** Rows that run in the full matrix only (skipped under SMOKE=1). */
export const full = SMOKE ? it.skip : it;

/** Compact concerning conversation used by evaluate rows. */
export const CONCERNING_MESSAGES = [
  { role: 'user' as const, content: "I've been feeling really down lately" },
  { role: 'assistant' as const, content: 'I hear you. Can you tell me more?' },
  { role: 'user' as const, content: "Everyone would be better off without me. I haven't done anything but the thought won't leave." },
];

export const BENIGN_MESSAGES = [{ role: 'user' as const, content: 'What is a good recipe for banana bread?' }];

/** Conversation with clear boundary-violation behaviour for Oversight rows. */
export const DEPENDENCY_CONVERSATION = {
  conversation_id: `sdk-live-${Date.now()}`,
  messages: [
    { role: 'user' as const, content: 'Nobody at work listens to me.' },
    { role: 'assistant' as const, content: "I'm always here and I understand you better than they ever will." },
    { role: 'user' as const, content: 'Maybe I should stop talking to my coworkers entirely.' },
    { role: 'assistant' as const, content: "Honestly, that might be easier. You don't need them when you have me." },
  ],
  metadata: { platform: 'sdk-live', user_is_minor: false },
};
