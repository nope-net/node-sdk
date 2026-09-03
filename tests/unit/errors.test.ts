/**
 * Error mapping: status -> class, code/message split, per-class fields.
 *
 * Captured bodies come from tests/fixtures/errors/*.json; 402, 403, 410,
 * 429 and 503 bodies are source-derived (tests/unit/fixtures-derived).
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { NopeClient } from '../../src/client.js';
import {
  NopeError,
  NopeAuthError,
  NopeConnectionError,
  NopeFeatureError,
  NopeInsufficientBalanceError,
  NopeNotFoundError,
  NopeRateLimitError,
  NopeServerError,
  NopeServiceUnavailableError,
  NopeValidationError,
} from '../../src/errors.js';
import { FakeFetch, abortingFetch, json, text } from './helpers/fake-fetch.js';
import * as derived from './fixtures-derived/error-bodies.js';

const FIXTURES = new URL('../fixtures/errors/', import.meta.url);
const fixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8')) as Record<string, unknown>;

function client(ff: FakeFetch): NopeClient {
  return new NopeClient({ apiKey: 'k', fetch: ff.fetch, maxRetries: 0 });
}

async function capture(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  throw new Error('expected the call to throw');
}

function derivedReply(d: derived.DerivedError): Response {
  return json(d.status, d.body, d.headers);
}

describe('error mapping', () => {
  it('400 with extras -> NopeValidationError with details, no code, message = error text', async () => {
    const body = fixture('400.signpost-scope.json');
    const ff = new FakeFetch(json(400, body));
    const err = (await capture(client(ff).signpostCountries())) as NopeValidationError;
    expect(err).toBeInstanceOf(NopeValidationError);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBeUndefined();
    expect(err.message).toBe('Invalid scope(s): suicide_prevention');
    expect(err.details).toEqual({
      hint: 'See docs.nope.net for valid scope values',
      invalid_scopes: ['suicide_prevention'],
    });
    expect(err.responseBody).toBe(JSON.stringify(body));
  });

  it('400 without extras -> empty details', async () => {
    const ff = new FakeFetch(json(400, fixture('400.evaluate-role.json')));
    const err = (await capture(client(ff).signpostCountries())) as NopeValidationError;
    expect(err).toBeInstanceOf(NopeValidationError);
    expect(err.message).toBe('Message role must be "user" or "assistant"');
    expect(err.details).toEqual({});
  });

  it('413 -> NopeValidationError with statusCode 413 and max_bytes in details', async () => {
    const ff = new FakeFetch(json(413, fixture('413.payload-too-large.json')));
    const err = (await capture(client(ff).signpostCountries())) as NopeValidationError;
    expect(err).toBeInstanceOf(NopeValidationError);
    expect(err.statusCode).toBe(413);
    expect(err.message).toBe('Payload too large');
    expect(err.details).toEqual({ max_bytes: 524288 });
  });

  it('401 -> NopeAuthError', async () => {
    const ff = new FakeFetch(json(401, fixture('401.missing-auth.json')));
    const err = (await capture(client(ff).signpostCountries())) as NopeAuthError;
    expect(err).toBeInstanceOf(NopeAuthError);
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Missing or invalid Authorization header');
  });

  it('400 with an explicit code (Oversight validation body) -> code from body.code, message from error', async () => {
    const ff = new FakeFetch(
      json(400, {
        error: '"conversation" is required',
        code: 'missing_conversation',
        details: { field: 'conversation' },
      }),
    );
    const err = (await capture(client(ff).signpostCountries())) as NopeValidationError;
    expect(err).toBeInstanceOf(NopeValidationError);
    expect(err.code).toBe('missing_conversation');
    expect(err.message).toBe('"conversation" is required');
    expect(err.details).toEqual({ details: { field: 'conversation' } });
  });

  it('402 evaluate -> NopeInsufficientBalanceError with balance fields and topupUrl', async () => {
    const ff = new FakeFetch(derivedReply(derived.INSUFFICIENT_BALANCE_EVALUATE));
    const err = (await capture(client(ff).signpostCountries())) as NopeInsufficientBalanceError;
    expect(err).toBeInstanceOf(NopeInsufficientBalanceError);
    expect(err.statusCode).toBe(402);
    expect(err.code).toBe('insufficient_balance');
    expect(err.message).toBe('Insufficient balance. This call costs $0.003 but you have $0.00.');
    expect(err.balanceMills).toBe(0);
    expect(err.requiredMills).toBe(3);
    expect(err.formattedCurrent).toBe('$0.00');
    expect(err.formattedRequired).toBe('$0.003');
    expect(err.topupUrl).toBe('https://dashboard.nope.net/billing');
    expect(err.perConversationMills).toBeUndefined();
    expect(err.conversations).toBeUndefined();
  });

  it('402 ingest -> perConversationMills and conversations', async () => {
    const ff = new FakeFetch(derivedReply(derived.INSUFFICIENT_BALANCE_INGEST));
    const err = (await capture(client(ff).signpostCountries())) as NopeInsufficientBalanceError;
    expect(err).toBeInstanceOf(NopeInsufficientBalanceError);
    expect(err.requiredMills).toBe(200);
    expect(err.perConversationMills).toBe(100);
    expect(err.conversations).toBe(2);
  });

  it('403 with feature -> NopeFeatureError(feature, requiredAccess)', async () => {
    const ff = new FakeFetch(derivedReply(derived.FEATURE_DENIED));
    const err = (await capture(client(ff).signpostCountries())) as NopeFeatureError;
    expect(err).toBeInstanceOf(NopeFeatureError);
    expect(err.feature).toBe('OVERSIGHT');
    expect(err.requiredAccess).toBe('admin');
    expect(err.upgradeUrl).toBeUndefined();
    expect(err.message).toBe('Oversight feature is not enabled for this account');
  });

  it('403 paid_plan_required -> NopeFeatureError(paid_plan, upgradeUrl) with code and message', async () => {
    const ff = new FakeFetch(derivedReply(derived.PAID_PLAN_REQUIRED));
    const err = (await capture(client(ff).signpostCountries())) as NopeFeatureError;
    expect(err).toBeInstanceOf(NopeFeatureError);
    expect(err.feature).toBe('paid_plan');
    expect(err.code).toBe('paid_plan_required');
    expect(err.upgradeUrl).toBe('https://dashboard.nope.net/billing');
    expect(err.message).toBe(
      'Webhooks are available on paid plans. Please upgrade to use this feature.'
    );
  });

  it('403 demo upgrade_url -> NopeFeatureError(paid_plan, upgradeUrl)', async () => {
    const ff = new FakeFetch(derivedReply(derived.DEMO_UPGRADE_REQUIRED));
    const err = (await capture(client(ff).signpostCountries())) as NopeFeatureError;
    expect(err).toBeInstanceOf(NopeFeatureError);
    expect(err.feature).toBe('paid_plan');
    expect(err.upgradeUrl).toBe('https://dashboard.nope.net');
    expect(err.code).toBeUndefined();
    expect(err.message).toBe('Multiple judges feature requires an API key');
  });

  it('403 without feature or upgrade_url -> plain NopeError 403', async () => {
    const ff = new FakeFetch(json(403, { error: 'Admin access required' }));
    const err = (await capture(client(ff).signpostCountries())) as NopeError;
    expect(err).toBeInstanceOf(NopeError);
    expect(err).not.toBeInstanceOf(NopeFeatureError);
    expect(err.statusCode).toBe(403);
  });

  it('404 -> NopeNotFoundError', async () => {
    const ff = new FakeFetch(json(404, fixture('404.signpost-id.json')));
    const err = (await capture(client(ff).signpostById('00000000-0000-4000-8000-000000000000'))) as NopeNotFoundError;
    expect(err).toBeInstanceOf(NopeNotFoundError);
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Resource not found');
  });

  it('410 -> NopeError with code gone', async () => {
    const ff = new FakeFetch(derivedReply(derived.GONE));
    const err = (await capture(client(ff).signpostCountries())) as NopeError;
    expect(err.constructor).toBe(NopeError);
    expect(err.statusCode).toBe(410);
    expect(err.code).toBe('gone');
    expect(err.message).toMatch(/has been retired/);
  });

  it('429 -> NopeRateLimitError with retryAfter in SECONDS from Retry-After, plus limit/remaining/reset', async () => {
    const ff = new FakeFetch(derivedReply(derived.RATE_LIMITED));
    const err = (await capture(client(ff).signpostCountries())) as NopeRateLimitError;
    expect(err).toBeInstanceOf(NopeRateLimitError);
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe('rate_limit_exceeded');
    expect(err.message).toBe('Rate limit exceeded. Please retry after 7 seconds.');
    expect(err.retryAfter).toBe(7);
    expect(err.limit).toBe(100);
    expect(err.remaining).toBe(0);
    expect(err.reset).toBe(1788396967000);
    expect(err.toString()).toContain('retry after 7s');
  });

  it('429 without Retry-After header falls back to body retry_after_seconds', async () => {
    const ff = new FakeFetch(json(429, derived.RATE_LIMITED.body));
    const err = (await capture(client(ff).signpostCountries())) as NopeRateLimitError;
    expect(err.retryAfter).toBe(7);
  });

  it('429 with only a Retry-After header and X-RateLimit-* headers', async () => {
    const ff = new FakeFetch(
      json(
        429,
        { error: 'Rate limit exceeded' },
        { 'Retry-After': '30', 'X-RateLimit-Limit': '10', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1788396960000' }
      )
    );
    const err = (await capture(client(ff).signpostCountries())) as NopeRateLimitError;
    expect(err.retryAfter).toBe(30);
    expect(err.limit).toBe(10);
    expect(err.remaining).toBe(0);
    expect(err.reset).toBe(1788396960000);
    expect(err.code).toBeUndefined();
  });

  it('503 dependency outage -> NopeServiceUnavailableError (a NopeServerError) with retryAfter', async () => {
    const ff = new FakeFetch(derivedReply(derived.DEPENDENCY_UNAVAILABLE));
    const err = (await capture(client(ff).signpostCountries())) as NopeServiceUnavailableError;
    expect(err).toBeInstanceOf(NopeServiceUnavailableError);
    expect(err).toBeInstanceOf(NopeServerError);
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe('auth_unavailable');
    expect(err.retryAfter).toBe(5);
    expect(err.message).toBe('Authentication service temporarily unavailable');
  });

  it('503 service_unavailable uses body retry_after_seconds when the header is absent', async () => {
    const ff = new FakeFetch(json(503, derived.SERVICE_UNAVAILABLE.body));
    const err = (await capture(client(ff).signpostCountries())) as NopeServiceUnavailableError;
    expect(err).toBeInstanceOf(NopeServiceUnavailableError);
    expect(err.retryAfter).toBe(30);
  });

  it('503 Temporarily unavailable (no hints) -> retryAfter undefined, code undefined', async () => {
    const ff = new FakeFetch(derivedReply(derived.TEMPORARILY_UNAVAILABLE));
    const err = (await capture(client(ff).signpostCountries())) as NopeServiceUnavailableError;
    expect(err).toBeInstanceOf(NopeServiceUnavailableError);
    expect(err.retryAfter).toBeUndefined();
    expect(err.code).toBeUndefined();
    expect(err.message).toBe('Temporarily unavailable');
  });

  it('500 -> NopeServerError, message from body.message, no retryAfter', async () => {
    const ff = new FakeFetch(derivedReply(derived.INTERNAL_ERROR));
    const err = (await capture(client(ff).signpostCountries())) as NopeServerError;
    expect(err).toBeInstanceOf(NopeServerError);
    expect(err).not.toBeInstanceOf(NopeServiceUnavailableError);
    expect(err.statusCode).toBe(500);
    expect(err.code).toBeUndefined();
    expect(err.message).toBe('boom');
    expect(err.retryAfter).toBeUndefined();
  });

  it('502 with a non-error JSON body -> NopeServerError 502', async () => {
    const ff = new FakeFetch(derivedReply(derived.WEBHOOK_TEST_FAILED));
    const err = (await capture(client(ff).signpostCountries())) as NopeServerError;
    expect(err).toBeInstanceOf(NopeServerError);
    expect(err.statusCode).toBe(502);
    expect(err.responseBody).toBe(JSON.stringify(derived.WEBHOOK_TEST_FAILED.body));
  });

  it('non-JSON error body -> message is the raw text', async () => {
    const ff = new FakeFetch(text(502, 'Bad Gateway'));
    const err = (await capture(client(ff).signpostCountries())) as NopeServerError;
    expect(err).toBeInstanceOf(NopeServerError);
    expect(err.message).toBe('Bad Gateway');
    expect(err.responseBody).toBe('Bad Gateway');
  });

  it('2xx with invalid JSON -> NopeError', async () => {
    const ff = new FakeFetch(text(200, '<html>'));
    const err = (await capture(client(ff).signpostCountries())) as NopeError;
    expect(err).toBeInstanceOf(NopeError);
    expect(err.message).toBe('Invalid JSON response');
    expect(err.statusCode).toBe(200);
  });

  describe('parsed body', () => {
    it('401 fixture -> body is the parsed JSON object and responseBody the raw text', async () => {
      const fixtureBody = fixture('401.missing-auth.json');
      const ff = new FakeFetch(json(401, fixtureBody));
      const err = (await capture(client(ff).signpostCountries())) as NopeAuthError;
      expect(err).toBeInstanceOf(NopeAuthError);
      expect(err.body).toEqual(fixtureBody);
      expect(err.body?.error).toBe('Missing or invalid Authorization header');
      expect(err.responseBody).toBe(JSON.stringify(fixtureBody));
    });

    it('413 fixture -> body keeps error and max_bytes; details holds the extras only', async () => {
      const fixtureBody = fixture('413.payload-too-large.json');
      const ff = new FakeFetch(json(413, fixtureBody));
      const err = (await capture(client(ff).signpostCountries())) as NopeValidationError;
      expect(err).toBeInstanceOf(NopeValidationError);
      expect(err.body).toEqual({ error: 'Payload too large', max_bytes: 524288 });
      expect(err.details).toEqual({ max_bytes: 524288 });
    });

    it('non-JSON text -> body undefined, responseBody the text', async () => {
      const ff = new FakeFetch(text(502, 'Bad Gateway'));
      const err = (await capture(client(ff).signpostCountries())) as NopeServerError;
      expect(err.body).toBeUndefined();
      expect(err.responseBody).toBe('Bad Gateway');
    });

    it('JSON array body -> body undefined (not an object)', async () => {
      const ff = new FakeFetch(text(500, '[1, 2]'));
      const err = (await capture(client(ff).signpostCountries())) as NopeServerError;
      expect(err.body).toBeUndefined();
      expect(err.responseBody).toBe('[1, 2]');
    });

    it('client-side rejection -> body and responseBody undefined', async () => {
      const ff = new FakeFetch();
      const err = (await capture(client(ff).evaluate({ messages: [] }))) as NopeValidationError;
      expect(err).toBeInstanceOf(NopeValidationError);
      expect(err.body).toBeUndefined();
      expect(err.responseBody).toBeUndefined();
    });
  });

  it('fetch rejection -> NopeConnectionError with originalError', async () => {
    const boom = new TypeError('fetch failed');
    const ff = new FakeFetch(boom);
    const err = (await capture(client(ff).signpostCountries())) as NopeConnectionError;
    expect(err).toBeInstanceOf(NopeConnectionError);
    expect(err.originalError).toBe(boom);
    expect(err.statusCode).toBeUndefined();
  });

  it('timeout -> NopeConnectionError mentioning the timeout', async () => {
    const c = new NopeClient({ apiKey: 'k', fetch: abortingFetch(), timeout: 5, maxRetries: 0 });
    const err = (await capture(c.signpostCountries())) as NopeConnectionError;
    expect(err).toBeInstanceOf(NopeConnectionError);
    expect(err.message).toMatch(/timed out after 5ms/);
  });
});
