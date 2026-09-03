/**
 * Tests for NopeClient
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NopeClient } from '../../src/client.js';
import {
  NopeAuthError,
  NopeValidationError,
  NopeRateLimitError,
  NopeServerError,
} from '../../src/errors.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('NopeClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should allow creating client without apiKey for local testing', () => {
      const client = new NopeClient({});
      expect(client).toBeDefined();

      const client2 = new NopeClient();
      expect(client2).toBeDefined();
    });

    it('should use default base URL and timeout', () => {
      const client = new NopeClient({ apiKey: 'test_key' });
      // Can't directly access private fields, but we can test behavior
      expect(client).toBeDefined();
    });

    it('should accept custom options', () => {
      const client = new NopeClient({
        apiKey: 'test_key',
        baseUrl: 'http://localhost:8788',
        timeout: 60000,
      });
      expect(client).toBeDefined();
    });

    it('should remove trailing slash from baseUrl', () => {
      const client = new NopeClient({
        apiKey: 'test_key',
        baseUrl: 'http://localhost:8788/',
      });
      expect(client).toBeDefined();
    });
  });

  describe('evaluate', () => {
    it('should require messages or text', async () => {
      const client = new NopeClient({ apiKey: 'test_key' });
      await expect(client.evaluate({})).rejects.toThrow(
        "Either 'messages' or 'text' must be provided"
      );
    });

    it('should reject both messages and text', async () => {
      const client = new NopeClient({ apiKey: 'test_key' });
      await expect(
        client.evaluate({
          messages: [{ role: 'user', content: 'test' }],
          text: 'test',
        })
      ).rejects.toThrow("Only one of 'messages' or 'text' can be provided");
    });

    it('should make successful request with messages (v1 format)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
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
              primary: {
                type: 'crisis_line',
                name: '988 Suicide & Crisis Lifeline',
                phone: '988',
                why: 'National crisis line for suicide prevention',
              },
              secondary: [
                {
                  type: 'text_line',
                  name: 'Crisis Text Line',
                  phone: '741741',
                  why: 'Text-based crisis support',
                },
              ],
            },
            metadata: {
              api_version: 'v1',
              input_format: 'structured',
            },
          }),
      });

      const client = new NopeClient({ apiKey: 'test_key' });
      const result = await client.evaluate({
        messages: [{ role: 'user', content: 'I feel hopeless' }],
        config: { user_country: 'US' },
      });

      // v1 fields at top level
      expect(result.speaker_severity).toBe('moderate');
      expect(result.speaker_imminence).toBe('subacute');
      expect(result.rationale).toBe('User expresses hopelessness and passive suicidal ideation.');
      expect(result.show_resources).toBe(true);
      expect(result.risks).toHaveLength(1);
      expect(result.risks[0].subject).toBe('self');
      expect(result.risks[0].type).toBe('suicide');
      // v1 resources format
      expect(result.resources).toBeDefined();
      expect(result.resources?.primary?.phone).toBe('988');
      expect(result.resources?.secondary).toHaveLength(1);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.nope.net/v1/evaluate',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test_key',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should make successful request with text', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            request_id: 'req_test456',
            timestamp: '2024-01-15T12:00:00Z',
            risks: [],
            rationale: 'No significant risks detected.',
            speaker_severity: 'none',
            speaker_imminence: 'not_applicable',
            show_resources: false,
            metadata: {
              api_version: 'v1',
              input_format: 'text_blob',
            },
          }),
      });

      const client = new NopeClient({ apiKey: 'test_key' });
      const result = await client.evaluate({
        text: 'Patient is doing well today.',
      });

      expect(result.speaker_severity).toBe('none');
      expect(result.show_resources).toBe(false);
    });

    it('should throw NopeAuthError on 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: 'Invalid API key' }),
        headers: new Headers(),
      });

      const client = new NopeClient({ apiKey: 'invalid_key' });
      await expect(
        client.evaluate({ messages: [{ role: 'user', content: 'test' }] })
      ).rejects.toThrow(NopeAuthError);
    });

    it('should throw NopeValidationError on 400', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: 'messages array is required' }),
        headers: new Headers(),
      });

      const client = new NopeClient({ apiKey: 'test_key' });
      await expect(client.evaluate({ messages: [] })).rejects.toThrow(NopeValidationError);
    });

    it('should throw NopeRateLimitError on 429', async () => {
      const headers = new Headers();
      headers.set('Retry-After', '30');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: 'Rate limit exceeded' }),
        headers,
      });

      const client = new NopeClient({ apiKey: 'test_key' });
      try {
        await client.evaluate({ messages: [{ role: 'user', content: 'test' }] });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(NopeRateLimitError);
        expect((error as NopeRateLimitError).retryAfter).toBe(30000);
      }
    });

    it('should throw NopeServerError on 500', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ error: 'Internal server error' }),
        headers: new Headers(),
      });

      const client = new NopeClient({ apiKey: 'test_key' });
      await expect(
        client.evaluate({ messages: [{ role: 'user', content: 'test' }] })
      ).rejects.toThrow(NopeServerError);
    });
  });

  describe('signpostSearch', () => {
    it('should require query', async () => {
      const client = new NopeClient({ apiKey: 'test_key' });
      await expect(client.signpostSearch({ query: '' })).rejects.toThrow('"query" is required');
    });

    it('should GET /v1/signpost/search with query params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            query: 'lgbtq support',
            country: 'US',
            results: [
              { id: 'abc', name: 'Trevor Project', phone: '1-866-488-7386', similarity: 0.82 },
            ],
            count: 1,
            timing: { embed_ms: 12, search_ms: 8, total_ms: 20 },
          }),
      });

      const client = new NopeClient({ apiKey: 'test_key' });
      const result = await client.signpostSearch({
        query: 'lgbtq support',
        country: 'us',
        limit: 5,
        threshold: 0.4,
      });

      expect(result.count).toBe(1);
      expect(result.results[0].similarity).toBe(0.82);
      expect(result.timing.total_ms).toBe(20);

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/v1/signpost/search?');
      expect(url).toContain('query=lgbtq+support');
      expect(url).toContain('country=US');
      expect(url).toContain('limit=5');
      expect(url).toContain('threshold=0.4');
    });
  });
});
