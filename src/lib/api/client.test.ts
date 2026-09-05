/**
 * Regression tests for the API client's token lifecycle — the production bug
 * that intermittently showed "Authentication required.":
 *  1. an expired access token must be refreshed and the original request
 *     retried exactly once;
 *  2. the ROTATED refresh token returned by the backend must be persisted
 *     (the old one is revoked — keeping it breaks the NEXT refresh);
 *  3. concurrent 401s must share ONE refresh (no stampede);
 *  4. a definitively failed refresh must clear tokens + notify the UI and
 *     must not loop;
 *  5. transient failures (network errors) must NOT clear the session.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAccessToken,
  getRefreshToken,
  onAuthInvalidated,
  refreshAccessToken,
  request,
  setTokens,
} from './client';

interface FetchCall {
  url: string;
  method: string;
  auth: string | null;
  body: unknown;
}

type ScriptedResponse = {
  status: number;
  json?: unknown;
  throw?: Error;
};

function jsonResponse(status: number, json?: unknown): Response {
  return new Response(json === undefined ? null : JSON.stringify(json), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Records every fetch call and answers from a script: (call) => ScriptedResponse | Promise<...>. */
function mockFetch(script: (call: FetchCall, calls: FetchCall[]) => ScriptedResponse | Promise<ScriptedResponse>) {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      const call: FetchCall = {
        url,
        method: init?.method ?? 'GET',
        auth: headers.get('Authorization'),
        body: init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined,
      };
      calls.push(call);
      const out = await script(call, calls);
      if (out.throw) throw out.throw;
      return jsonResponse(out.status, out.json);
    }),
  );
  return calls;
}

const UNAUTHORIZED = { code: 'auth_error', message: 'Authentication required.' };
const REVOKED = { code: 'auth_error', message: 'Invalid or revoked refresh token.' };

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  // The module keeps a shared in-flight refresh promise; tests always start
  // with the lock released (it is released as soon as the refresh settles).
});

describe('request() — 401 handling', () => {
  it('refreshes an expired access token, persists the ROTATED refresh token, and retries once', async () => {
    setTokens('old-access', 'refresh-1');
    const calls = mockFetch(call => {
      if (call.url.endsWith('/api/auth/refresh')) {
        return { status: 200, json: { access_token: 'new-access', refresh_token: 'refresh-2', expires_in: 900 } };
      }
      if (call.auth === 'Bearer old-access') {
        return { status: 401, json: UNAUTHORIZED };
      }
      return { status: 200, json: { ok: true } };
    });

    const data = await request<{ ok: boolean }>('/dashboard');

    expect(data).toEqual({ ok: true });
    expect(calls).toHaveLength(3); // original 401 → refresh → retry
    expect(getAccessToken()).toBe('new-access');
    // THE core regression: the rotated refresh token must replace the
    // (now revoked) old one in storage.
    expect(getRefreshToken()).toBe('refresh-2');
  });

  it('retries the original request exactly once (no infinite retry loop)', async () => {
    setTokens('old-access', 'refresh-1');
    let retryCount = 0;
    const calls = mockFetch(call => {
      if (call.url.endsWith('/api/auth/refresh')) {
        return { status: 200, json: { access_token: 'new-access', refresh_token: 'refresh-2', expires_in: 900 } };
      }
      if (call.auth === 'Bearer new-access') {
        retryCount++;
        return { status: 401, json: UNAUTHORIZED }; // even the fresh token is rejected
      }
      return { status: 401, json: UNAUTHORIZED };
    });

    await expect(request('/dashboard')).rejects.toMatchObject({ status: 401 });
    expect(retryCount).toBe(1);
    expect(calls).toHaveLength(3); // no second refresh, no third attempt
  });

  it('does NOT refresh for unauthenticated requests (auth: null)', async () => {
    setTokens('old-access', 'refresh-1');
    const calls = mockFetch(() => ({ status: 401, json: UNAUTHORIZED }));

    await expect(request('/auth/login', { method: 'POST', auth: null, body: {} })).rejects.toMatchObject({
      status: 401,
    });
    // Only the single attempted call — no refresh side effect.
    expect(calls).toHaveLength(1);
  });

  it('does NOT refresh for student-attempt requests (auth: student)', async () => {
    setTokens('old-access', 'refresh-1');
    const calls = mockFetch(() => ({ status: 401, json: UNAUTHORIZED }));

    await expect(request('/attempts/abc', { auth: 'student', token: 'attempt-token' })).rejects.toMatchObject({
      status: 401,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].auth).toBe('Bearer attempt-token');
  });
});

describe('refreshAccessToken() — concurrent refresh prevention', () => {
  it('shares ONE in-flight refresh across many simultaneous 401s', async () => {
    setTokens('old-access', 'refresh-1');
    let refreshCalls = 0;
    const calls = mockFetch(call => {
      if (call.url.endsWith('/api/auth/refresh')) {
        refreshCalls++;
        // Simulate network latency so all the initial 401s pile up while the
        // single refresh is in flight.
        return new Promise<ScriptedResponse>(resolve =>
          setTimeout(
            () =>
              resolve({
                status: 200,
                json: { access_token: 'new-access', refresh_token: 'refresh-2', expires_in: 900 },
              }),
            20,
          ),
        );
      }
      if (call.auth === 'Bearer old-access') return { status: 401, json: UNAUTHORIZED };
      return { status: 200, json: { n: call.auth } };
    });

    const results = await Promise.all(
      [1, 2, 3, 4, 5].map(() => request<{ n: string }>(`/dashboard?i=${Math.random()}`)),
    );

    expect(results).toHaveLength(5);
    results.forEach(r => expect(r.n).toBe('Bearer new-access'));
    // THE stampede regression: exactly one refresh for five simultaneous 401s.
    expect(refreshCalls).toBe(1);
    expect(calls.filter(c => c.url.endsWith('/api/auth/refresh'))).toHaveLength(1);
    // 5 original 401s + 1 refresh + 5 retries
    expect(calls).toHaveLength(11);
    expect(getRefreshToken()).toBe('refresh-2');
  });

  it('concurrent callers all observe the same refresh result on failure', async () => {
    setTokens('old-access', 'refresh-1');
    const invalidated = vi.fn();
    const unsub = onAuthInvalidated(invalidated);
    const calls = mockFetch(call => {
      if (call.url.endsWith('/api/auth/refresh')) return { status: 401, json: REVOKED };
      return { status: 401, json: UNAUTHORIZED };
    });

    const results = await Promise.allSettled(
      [1, 2, 3].map(() => request('/dashboard')),
    );

    results.forEach(r => expect(r.status).toBe('rejected'));
    expect(calls.filter(c => c.url.endsWith('/api/auth/refresh'))).toHaveLength(1);
    // Session cleared exactly once, UI notified exactly once.
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(invalidated).toHaveBeenCalledTimes(1);
    unsub();
  });
});

describe('refreshAccessToken() — failure semantics', () => {
  it('clears tokens and notifies the UI when the refresh session is definitively invalid', async () => {
    setTokens('old-access', 'refresh-1');
    const invalidated = vi.fn();
    const unsub = onAuthInvalidated(invalidated);
    const calls = mockFetch(call => {
      if (call.url.endsWith('/api/auth/refresh')) return { status: 401, json: REVOKED };
      return { status: 401, json: UNAUTHORIZED };
    });

    await expect(request('/dashboard')).rejects.toMatchObject({ status: 401 });

    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(invalidated).toHaveBeenCalledTimes(1);
    // original 401 + refresh 401 — nothing retried, no loop
    expect(calls).toHaveLength(2);
    unsub();
  });

  it('does NOT clear the session on transient (network) failures', async () => {
    setTokens('old-access', 'refresh-1');
    const invalidated = vi.fn();
    const unsub = onAuthInvalidated(invalidated);
    const calls = mockFetch(call => {
      if (call.url.endsWith('/api/auth/refresh')) {
        return { status: 503, json: UNAUTHORIZED, throw: new TypeError('Failed to fetch') };
      }
      return { status: 401, json: UNAUTHORIZED };
    });

    await expect(request('/dashboard')).rejects.toMatchObject({ status: 401 });

    // Tokens must survive a network blip so the next request can retry.
    expect(getAccessToken()).toBe('old-access');
    expect(getRefreshToken()).toBe('refresh-1');
    expect(invalidated).not.toHaveBeenCalled();
    expect(calls).toHaveLength(2);
    unsub();
  });

  it('retries once with a fresher token when a sibling tab rotated the refresh token', async () => {
    setTokens('old-access', 'refresh-1');
    const calls = mockFetch(call => {
      if (call.url.endsWith('/api/auth/refresh')) {
        const sent = (call.body as { refresh_token: string }).refresh_token;
        if (sent === 'refresh-1') {
          // Sibling tab already rotated: storage now holds refresh-2.
          localStorage.setItem('ty_api_refresh', 'refresh-2');
          return { status: 401, json: REVOKED };
        }
        return {
          status: 200,
          json: { access_token: 'new-access', refresh_token: 'refresh-3', expires_in: 900 },
        };
      }
      return { status: 401, json: UNAUTHORIZED };
    });

    const ok = await refreshAccessToken();

    expect(ok).toBe(true);
    expect(calls.filter(c => c.url.endsWith('/api/auth/refresh'))).toHaveLength(2);
    expect(getAccessToken()).toBe('new-access');
    expect(getRefreshToken()).toBe('refresh-3');
  });

  it('does not fire logout when the user logged out while a refresh was in flight', async () => {
    setTokens('old-access', 'refresh-1');
    const invalidated = vi.fn();
    const unsub = onAuthInvalidated(invalidated);
    mockFetch(call => {
      if (call.url.endsWith('/api/auth/refresh')) {
        // The user signed out (in this or another tab) while the refresh ran:
        // storage no longer holds the token we tried.
        localStorage.removeItem('ty_api_access');
        localStorage.removeItem('ty_api_refresh');
        return { status: 401, json: REVOKED };
      }
      return { status: 401, json: UNAUTHORIZED };
    });

    await expect(refreshAccessToken()).resolves.toBe(false);

    // The stale in-flight failure must NOT re-clear or re-fire logout.
    expect(invalidated).not.toHaveBeenCalled();
    unsub();
  });
});

describe('refresh lock lifecycle', () => {
  it('releases the lock after a failure so a later login can refresh again', async () => {
    setTokens('old-access', 'refresh-1');
    let first = true;
    mockFetch(call => {
      if (call.url.endsWith('/api/auth/refresh')) {
        if (first) {
          first = false;
          return { status: 401, json: REVOKED };
        }
        return { status: 200, json: { access_token: 'a2', refresh_token: 'r2', expires_in: 900 } };
      }
      return { status: 200, json: {} };
    });

    // First refresh fails definitively (tokens cleared, UI notified).
    await expect(refreshAccessToken()).resolves.toBe(false);
    expect(getRefreshToken()).toBeNull();

    // The user logs in again — a later refresh must work (lock was released).
    setTokens('a1', 'r1');
    await expect(refreshAccessToken()).resolves.toBe(true);
    expect(getAccessToken()).toBe('a2');
    expect(getRefreshToken()).toBe('r2');
  });
});
