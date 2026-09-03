/**
 * Client-side rejections throw NopeValidationError before any request is
 * sent. Two sources: input validation (`code: 'invalid_request'`) and
 * demo-mode refusals (`code: 'not_available_in_demo'`). Both carry no
 * statusCode (there was no response), the same message the plain Error used
 * to carry, and empty details.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NopeClient } from '../../src/client.js';
import { NopeError, NopeValidationError } from '../../src/errors.js';
import type { Message } from '../../src/types.js';
import { FakeFetch } from './helpers/fake-fetch.js';

interface Case {
  name: string;
  demo?: boolean;
  call: (client: NopeClient<boolean>) => Promise<unknown>;
  code: 'invalid_request' | 'not_available_in_demo';
  message: string;
}

const user: Message = { role: 'user', content: 'x' };
const systemRole = [{ role: 'system', content: 'x' }] as unknown as Message[];
const conversation = { conversation_id: 'c', messages: [user] };

const CASES: Case[] = [
  // Input validation (the cases from the 4.0.0 blind report)
  { name: 'evaluate({ messages: [] })', call: (c) => c.evaluate({ messages: [] }), code: 'invalid_request', message: "'messages' cannot be empty" },
  { name: 'evaluate({})', call: (c) => c.evaluate({}), code: 'invalid_request', message: "Either 'messages' or 'text' must be provided" },
  { name: 'evaluate with a system role', call: (c) => c.evaluate({ messages: systemRole }), code: 'invalid_request', message: 'messages[0]: role must be "user" or "assistant"' },
  { name: 'evaluate with 101 messages', call: (c) => c.evaluate({ messages: Array.from({ length: 101 }, () => user) }), code: 'invalid_request', message: "'messages' may contain at most 100 messages (got 101)" },
  { name: 'evaluate with messages and text', call: (c) => c.evaluate({ messages: [user], text: 'x' }), code: 'invalid_request', message: "Only one of 'messages' or 'text' can be provided" },
  { name: 'evaluate with blank text', call: (c) => c.evaluate({ text: '   ' }), code: 'invalid_request', message: "'text' cannot be empty" },
  { name: 'screen({ messages: [] })', call: (c) => c.screen({ messages: [] }), code: 'invalid_request', message: "'messages' cannot be empty" },
  { name: 'ocular({ messages: [] })', call: (c) => c.ocular({ messages: [] }), code: 'invalid_request', message: "'messages' cannot be empty" },
  { name: 'ocular with trajectory_stride 0', call: (c) => c.ocular({ messages: [user], trajectory_stride: 0 }), code: 'invalid_request', message: '"trajectory_stride" must be an integer in 1..64' },
  { name: 'ocular with an empty user_id', call: (c) => c.ocular({ messages: [user], user_id: '' }), code: 'invalid_request', message: '"user_id" must be 1..256 characters' },
  { name: 'oversight.analyze with empty conversation.messages', call: (c) => c.oversight.analyze({ conversation: { messages: [] } }), code: 'invalid_request', message: '"conversation.messages" cannot be empty' },
  { name: 'oversight.analyze with enabled and disabled', call: (c) => c.oversight.analyze({ conversation, behaviors: { enabled: ['gaslighting'], disabled: ['barrier_erosion'] } }), code: 'invalid_request', message: '"behaviors.enabled" and "behaviors.disabled" are mutually exclusive' },
  { name: 'oversight.ingest with 301 conversations', call: (c) => c.oversight.ingest({ conversations: Array.from({ length: 301 }, (_, i) => ({ conversation_id: `c${i}`, messages: [user] })) }), code: 'invalid_request', message: 'Too many conversations: 301. Maximum allowed: 300' },
  { name: 'oversight.ingest with a conversation lacking conversation_id', call: (c) => c.oversight.ingest({ conversations: [{ conversation_id: '', messages: [user] }] }), code: 'invalid_request', message: 'Conversation at index 0 must have a "conversation_id"' },
  { name: 'signpostSearch with an empty query', call: (c) => c.signpostSearch({ query: '' }), code: 'invalid_request', message: '"query" is required' },
  // Demo refusals
  { name: 'demo signpost()', demo: true, call: (c) => c.signpost({ country: 'GB' }), code: 'not_available_in_demo', message: 'signpost() is not available in demo mode. Use an API key.' },
  { name: 'demo signpostSearch()', demo: true, call: (c) => c.signpostSearch({ query: 'x' }), code: 'not_available_in_demo', message: 'signpostSearch() is not available in demo mode. Use an API key.' },
  { name: 'demo screen()', demo: true, call: (c) => c.screen({ text: 'x' }), code: 'not_available_in_demo', message: 'screen() is not available in demo mode. Use evaluate(), which is served by /v1/try/evaluate.' },
  { name: 'demo oversight.ingest()', demo: true, call: (c) => c.oversight.ingest({ conversations: [conversation] }), code: 'not_available_in_demo', message: 'oversight.ingest() is not available in demo mode. Use an API key.' },
  { name: 'demo billing.balance()', demo: true, call: (c) => c.billing.balance(), code: 'not_available_in_demo', message: 'billing.balance() is not available in demo mode. Use an API key.' },
  { name: 'demo webhooks.list()', demo: true, call: (c) => c.webhooks.list(), code: 'not_available_in_demo', message: 'webhooks.list() is not available in demo mode. Use an API key.' },
];

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  throw new Error('expected the call to reject');
}

describe('client-side rejections are NopeValidationError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  for (const tc of CASES) {
    it(tc.name, async () => {
      const ff = new FakeFetch();
      const client = new NopeClient({ apiKey: tc.demo ? undefined : 'k', demo: tc.demo ?? false, fetch: ff.fetch });
      const err = (await rejection(tc.call(client))) as NopeValidationError;

      expect(err).toBeInstanceOf(NopeValidationError);
      expect(err).toBeInstanceOf(NopeError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('NopeValidationError');
      expect(err.code).toBe(tc.code);
      expect(err.statusCode).toBeUndefined();
      expect(err.message).toBe(tc.message);
      expect(err.details).toEqual({});
      expect(err.responseBody).toBeUndefined();
      expect(err.toString()).toBe(tc.message);
      expect(ff.requests).toHaveLength(0);
    });
  }
});

describe('NopeValidationError constructor', () => {
  it('defaults statusCode to 400 when none is named', () => {
    expect(new NopeValidationError('x').statusCode).toBe(400);
    expect(new NopeValidationError('x', { details: { a: 1 } }).statusCode).toBe(400);
  });

  it('keeps an explicit 413', () => {
    expect(new NopeValidationError('x', { statusCode: 413 }).statusCode).toBe(413);
  });

  it('keeps an explicit undefined status (client-side rejection)', () => {
    const err = new NopeValidationError('x', { statusCode: undefined, code: 'invalid_request' });
    expect(err.statusCode).toBeUndefined();
    expect(err.code).toBe('invalid_request');
    expect(err.details).toEqual({});
    expect(err.toString()).toBe('x');
  });
});
