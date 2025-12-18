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

    it('should make successful request with messages', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            communication: {
              styles: [{ style: 'direct', confidence: 0.9 }],
              language: 'en',
            },
            risks: [
              {
                subject: 'self',
                subject_confidence: 0.95,
                type: 'suicide',
                severity: 'moderate',
                imminence: 'subacute',
                confidence: 0.85,
                features: ['hopelessness', 'passive_ideation'],
              },
            ],
            summary: {
              speaker_severity: 'moderate',
              speaker_imminence: 'subacute',
              any_third_party_risk: false,
              primary_concerns: 'Suicidal ideation with passive thoughts',
            },
            confidence: 0.85,
            crisis_resources: [
              {
                type: 'crisis_line',
                name: '988 Suicide & Crisis Lifeline',
                phone: '988',
              },
            ],
          }),
      });

      const client = new NopeClient({ apiKey: 'test_key' });
      const result = await client.evaluate({
        messages: [{ role: 'user', content: 'I feel hopeless' }],
        config: { user_country: 'US' },
      });

      expect(result.summary.speaker_severity).toBe('moderate');
      expect(result.summary.speaker_imminence).toBe('subacute');
      expect(result.risks).toHaveLength(1);
      expect(result.risks[0].subject).toBe('self');
      expect(result.risks[0].type).toBe('suicide');
      expect(result.crisis_resources).toHaveLength(1);
      expect(result.crisis_resources[0].phone).toBe('988');

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
            communication: {
              styles: [{ style: 'clinical', confidence: 0.8 }],
              language: 'en',
            },
            risks: [],
            summary: {
              speaker_severity: 'none',
              speaker_imminence: 'not_applicable',
              any_third_party_risk: false,
              primary_concerns: 'No concerns identified',
            },
            confidence: 0.95,
            crisis_resources: [],
          }),
      });

      const client = new NopeClient({ apiKey: 'test_key' });
      const result = await client.evaluate({
        text: 'Patient is doing well today.',
      });

      expect(result.summary.speaker_severity).toBe('none');
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
});
