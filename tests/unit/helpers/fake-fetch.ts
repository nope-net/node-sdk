/**
 * Small injectable fetch fake for unit tests.
 *
 * Queue replies (Response objects, reply functions, or Errors to throw); every
 * call is recorded with its URL, method, headers and parsed JSON body. No
 * module mocking: the client takes `fetch` as a constructor option.
 */

import type { FetchLike } from '../../../src/http.js';

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  json?: unknown;
  signal?: AbortSignal | null;
}

export type Reply = Response | ((req: RecordedRequest) => Response | Promise<Response>) | Error;

export class FakeFetch {
  readonly requests: RecordedRequest[] = [];
  private readonly replies: Reply[] = [];

  constructor(...replies: Reply[]) {
    this.replies.push(...replies);
  }

  /** Queue more replies. Returns `this` for chaining. */
  reply(...replies: Reply[]): this {
    this.replies.push(...replies);
    return this;
  }

  get last(): RecordedRequest {
    const r = this.requests[this.requests.length - 1];
    if (!r) throw new Error('FakeFetch: no request recorded yet');
    return r;
  }

  readonly fetch: FetchLike = async (input, init) => {
    const headers: Record<string, string> = {};
    const rawHeaders = (init?.headers ?? {}) as Record<string, string>;
    for (const [k, v] of Object.entries(rawHeaders)) headers[k.toLowerCase()] = v;
    const body = typeof init?.body === 'string' ? init.body : undefined;
    const req: RecordedRequest = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers,
      body,
      json: body !== undefined ? (JSON.parse(body) as unknown) : undefined,
      signal: init?.signal ?? null,
    };
    this.requests.push(req);

    const next = this.replies.shift();
    if (next === undefined) {
      throw new Error(`FakeFetch: no reply queued for ${req.method} ${req.url}`);
    }
    if (next instanceof Error) throw next;
    if (typeof next === 'function') return next(req);
    return next;
  };
}

/** JSON response with the given status and extra headers. */
export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** Plain-text response (non-JSON bodies, proxies, etc.). */
export function text(status: number, body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/plain', ...headers } });
}

/**
 * A fetch that never resolves on its own and rejects with an AbortError as
 * soon as the request signal fires. Use with a tiny client `timeout`.
 */
export function abortingFetch(record: RecordedRequest[] = []): FetchLike {
  return (input, init) =>
    new Promise<Response>((_resolve, reject) => {
      record.push({
        url: String(input),
        method: init?.method ?? 'GET',
        headers: (init?.headers ?? {}) as Record<string, string>,
        signal: init?.signal ?? null,
      });
      const signal = init?.signal;
      if (!signal) return;
      const fail = () => {
        const err = new Error('This operation was aborted');
        err.name = 'AbortError';
        reject(err);
      };
      if (signal.aborted) fail();
      else signal.addEventListener('abort', fail, { once: true });
    });
}

/** Parse a `key: value` header dump (tests/fixtures/headers/*.txt). */
export function headersFromDump(dump: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of dump.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}
