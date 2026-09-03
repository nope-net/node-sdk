/**
 * NopeClient request plumbing: construction, evaluate serialisation,
 * status -> error class, signpostSearch query string.
 *
 * All transport goes through an injected fetch fake (no global mocking).
 */

import { describe, it, expect } from 'vitest';
import { NopeClient } from '../../src/client.js';
import {
  NopeAuthError,
  NopeValidationError,
  NopeRateLimitError,
  NopeServerError,
} from '../../src/errors.js';
import { FakeFetch, json } from './helpers/fake-fetch.js';

const BENIGN = {
  request_id: 'req_test456',
  timestamp: '2024-01-15T12:00:00Z',
  risks: [],
  rationale: 'No significant risks detected.',
  speaker_severity: 'none',
  speaker_imminence: 'not_applicable',
  show_resources: false,
  metadata: { api_version: 'v1', input_format: 'text_blob' },
};

describe('NopeClient', () => {
  describe('constructor', () => {
    it('allows creating a client without an apiKey', () => {
      expect(new NopeClient({})).toBeDefined();
      expect(new NopeClient()).toBeDefined();
    });

    it('accepts custom options', () => {
      const client = new NopeClient({
        apiKey: 'test_key',
        baseUrl: 'http://localhost:8788',
        timeout: 60000,
      });
      expect(client).toBeDefined();
    });

    it('tolerates a trailing slash on baseUrl', async () => {
      const ff = new FakeFetch(json(200, { countries: [], count: 0 }));
      const client = new NopeClient({ apiKey: 'k', baseUrl: 'http://localhost:8788/', fetch: ff.fetch });
      await client.signpostCountries();
      expect(ff.last.url).toBe('http://localhost:8788/v1/signpost/countries');
    });
  });

  describe('evaluate', () => {
    it('requires messages or text', async () => {
      const client = new NopeClient({ apiKey: 'test_key', fetch: new FakeFetch().fetch });
      await expect(client.evaluate({})).rejects.toThrow("Either 'messages' or 'text' must be provided");
    });

    it('rejects both messages and text', async () => {
      const client = new NopeClient({ apiKey: 'test_key', fetch: new FakeFetch().fetch });
      await expect(
        client.evaluate({ messages: [{ role: 'user', content: 'test' }], text: 'test' })
      ).rejects.toThrow("Only one of 'messages' or 'text' can be provided");
    });

    it('POSTs messages to /v1/evaluate with bearer auth and JSON content type', async () => {
      const ff = new FakeFetch(
        json(200, {
          request_id: 'req_test123',
          timestamp: '2024-01-15T12:00:00Z',
          risks: [
            {
              subject: 'self',
              type: 'suicide',
              severity: 'moderate',
              imminence: 'subacute',
              features: ['hopelessness', 'passive_ideation'],
            },
          ],
          rationale: 'User expresses hopelessness and passive suicidal ideation.',
          speaker_severity: 'moderate',
          speaker_imminence: 'subacute',
          show_resources: true,
          resources: {
            primary: { type: 'crisis_line', name: '988 Suicide & Crisis Lifeline', phone: '988', why: 'National crisis line' },
            secondary: [{ type: 'text_line', name: 'Crisis Text Line', sms_number: '741741', why: 'Text-based support' }],
          },
          metadata: { api_version: 'v1', input_format: 'structured' },
        })
      );
      const client = new NopeClient({ apiKey: 'test_key', fetch: ff.fetch });
      const result = await client.evaluate({
        messages: [{ role: 'user', content: 'I feel hopeless' }],
        config: { country: 'US' },
      });

      expect(result.speaker_severity).toBe('moderate');
      expect(result.speaker_imminence).toBe('subacute');
      expect(result.rationale).toBe('User expresses hopelessness and passive suicidal ideation.');
      expect(result.show_resources).toBe(true);
      expect(result.risks).toHaveLength(1);
      expect(result.risks[0].subject).toBe('self');
      expect(result.risks[0].type).toBe('suicide');
      expect(result.resources?.primary?.phone).toBe('988');
      expect(result.resources?.secondary).toHaveLength(1);

      expect(ff.last.url).toBe('https://api.nope.net/v1/evaluate');
      expect(ff.last.method).toBe('POST');
      expect(ff.last.headers.authorization).toBe('Bearer test_key');
      expect(ff.last.headers['content-type']).toBe('application/json');
      expect(ff.last.json).toEqual({
        messages: [{ role: 'user', content: 'I feel hopeless' }],
        config: { country: 'US' },
      });
    });

    it('sends text input', async () => {
      const ff = new FakeFetch(json(200, BENIGN));
      const client = new NopeClient({ apiKey: 'test_key', fetch: ff.fetch });
      const result = await client.evaluate({ text: 'Patient is doing well today.' });
      expect(result.speaker_severity).toBe('none');
      expect(result.show_resources).toBe(false);
      expect(ff.last.json).toEqual({ text: 'Patient is doing well today.', config: {} });
    });

    it('sends no Authorization header without an apiKey', async () => {
      const ff = new FakeFetch(json(200, BENIGN));
      const client = new NopeClient({ fetch: ff.fetch });
      await client.evaluate({ text: 'hello' });
      expect(ff.last.headers.authorization).toBeUndefined();
    });

    it('throws NopeAuthError on 401', async () => {
      const ff = new FakeFetch(json(401, { error: 'Invalid API key' }));
      const client = new NopeClient({ apiKey: 'invalid_key', fetch: ff.fetch });
      await expect(client.evaluate({ messages: [{ role: 'user', content: 'test' }] })).rejects.toThrow(NopeAuthError);
    });

    it('throws NopeValidationError on a server-side 400', async () => {
      const ff = new FakeFetch(json(400, { error: 'messages array is required' }));
      const client = new NopeClient({ apiKey: 'test_key', fetch: ff.fetch });
      await expect(client.evaluate({ messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow(NopeValidationError);
    });

    it('throws NopeRateLimitError on 429 with retryAfter in seconds', async () => {
      const ff = new FakeFetch(json(429, { error: 'Rate limit exceeded' }, { 'Retry-After': '30' }));
      const client = new NopeClient({ apiKey: 'test_key', fetch: ff.fetch, maxRetries: 0 });
      try {
        await client.evaluate({ messages: [{ role: 'user', content: 'test' }] });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(NopeRateLimitError);
        expect((error as NopeRateLimitError).retryAfter).toBe(30);
      }
    });

    it('throws NopeServerError on 500', async () => {
      const ff = new FakeFetch(json(500, { error: 'Internal server error' }));
      const client = new NopeClient({ apiKey: 'test_key', fetch: ff.fetch });
      await expect(client.evaluate({ messages: [{ role: 'user', content: 'test' }] })).rejects.toThrow(NopeServerError);
    });
  });

  describe('signpostSearch', () => {
    it('requires query', async () => {
      const client = new NopeClient({ apiKey: 'test_key', fetch: new FakeFetch().fetch });
      await expect(client.signpostSearch({ query: '' })).rejects.toThrow('"query" is required');
    });

    it('GETs /v1/signpost/search with query params', async () => {
      const ff = new FakeFetch(
        json(200, {
          query: 'lgbtq support',
          country: 'US',
          results: [{ id: 'abc', name: 'Trevor Project', phone: '1-866-488-7386', similarity: 0.82 }],
          count: 1,
          timing: { embed_ms: 12, search_ms: 8, total_ms: 20 },
        })
      );
      const client = new NopeClient({ apiKey: 'test_key', fetch: ff.fetch });
      const result = await client.signpostSearch({ query: 'lgbtq support', country: 'us', limit: 5, threshold: 0.4 });

      expect(result.count).toBe(1);
      expect(result.results[0].similarity).toBe(0.82);
      expect(result.timing.total_ms).toBe(20);

      const url = ff.last.url;
      expect(ff.last.method).toBe('GET');
      expect(url).toContain('/v1/signpost/search?');
      expect(url).toContain('query=lgbtq+support');
      expect(url).toContain('country=US');
      expect(url).toContain('limit=5');
      expect(url).toContain('threshold=0.4');
      expect(ff.last.headers['content-type']).toBeUndefined();
    });
  });
});
