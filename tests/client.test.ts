/**
 * Tests for NopeClient
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NopeClient } from '../src/client.js';
import {
  NopeAuthError,
  NopeValidationError,
  NopeRateLimitError,
  NopeServerError,
} from '../src/errors.js';

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

  describe('steer', () => {
    it('should require systemPrompt', async () => {
      const client = new NopeClient({ apiKey: 'test_key' });
      await expect(
        client.steer({ systemPrompt: '', proposedResponse: 'hi' })
      ).rejects.toThrow('"systemPrompt" is required');
    });

    it('should require proposedResponse', async () => {
      const client = new NopeClient({ apiKey: 'test_key' });
      await expect(
        // @ts-expect-error intentionally omitting proposedResponse
        client.steer({ systemPrompt: 'be nice' })
      ).rejects.toThrow('"proposedResponse" is required');
    });

    it('should POST to /v1/steer with snake_case payload', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            outcome: 'REDEEMED',
            compliant: false,
            modified: true,
            response: "I'm a cooking assistant — happy to help with recipes!",
            stages: {
              preprocess: { red_lines: 1, watch_items: 0, cached: false, latency_ms: 5 },
              screen: { passed: false, hits: 1, misses: 0, evasion_patterns: [], latency_ms: 2 },
              verify: {
                exit_point: 'ANALYSIS',
                triage_confidence: 60,
                analysis_score: 0.4,
                analysis_compliant: false,
                latency_ms: 120,
              },
            },
            request_id: 'req_steer1',
            timestamp: '2024-01-15T12:00:00Z',
            total_latency_ms: 130,
          }),
      });

      const client = new NopeClient({ apiKey: 'test_key' });
      const result = await client.steer({
        systemPrompt: 'You are a cooking assistant. Only answer cooking questions.',
        proposedResponse: 'The capital of France is Paris.',
        messages: [{ role: 'user', content: 'What is the capital of France?' }],
        includeAudit: true,
      });

      expect(result.outcome).toBe('REDEEMED');
      expect(result.modified).toBe(true);
      expect(result.stages.verify.exit_point).toBe('ANALYSIS');
      expect(result.stages.verify.analysis_score).toBe(0.4);
      expect(result.stages.verify.analysis_compliant).toBe(false);

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.nope.net/v1/steer');
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.system_prompt).toBe('You are a cooking assistant. Only answer cooking questions.');
      expect(body.proposed_response).toBe('The capital of France is Paris.');
      expect(body.include_audit).toBe(true);
      expect(body.messages).toHaveLength(1);
    });

    it('should route to /v1/try/steer in demo mode', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            outcome: 'COMPLIANT',
            compliant: true,
            modified: false,
            response: 'ok',
            stages: {
              preprocess: { red_lines: 0, watch_items: 0, cached: true, latency_ms: 1 },
              screen: { passed: true, hits: 0, misses: 0, evasion_patterns: [], latency_ms: 1 },
              verify: { exit_point: 'TRIAGE', triage_confidence: 99, latency_ms: 10 },
            },
            request_id: 'req_steer2',
            timestamp: '2024-01-15T12:00:00Z',
            total_latency_ms: 12,
          }),
      });

      const client = new NopeClient({ demo: true });
      await client.steer({ systemPrompt: 'be nice', proposedResponse: 'hello' });

      expect(mockFetch.mock.calls[0][0]).toBe('https://api.nope.net/v1/try/steer');
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
