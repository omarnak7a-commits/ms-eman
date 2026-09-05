/**
 * Session restoration tests — startup must distinguish AUTH_INITIALIZING from
 * UNAUTHENTICATED and must NOT log the user out while a valid session is being
 * restored (including silently refreshing an expired access token).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSession, getSession, hasPersistedSession, restoreSession } from './auth';
import { setTokens } from './api/client';

const TEACHER = {
  id: 't1',
  name: 'Ms Eman Zahy',
  email: 'ms.eman.zahy@test.com',
  role: 'teacher',
  created_at: '2026-01-01T00:00:00Z',
};

function jsonResponse(status: number, json?: unknown): Response {
  return new Response(json === undefined ? null : JSON.stringify(json), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('restoreSession()', () => {
  it('resolves the cached teacher when the session is valid', async () => {
    setTokens('access-1', 'refresh-1');
    localStorage.setItem('ty_teacher', JSON.stringify(TEACHER));
    const fetchFn = mockFetch(url => {
      if (url.endsWith('/api/auth/me')) return jsonResponse(200, { teacher: TEACHER });
      return jsonResponse(404);
    });

    const teacher = await restoreSession();

    expect(teacher).toEqual(TEACHER);
    expect(getSession()).toEqual(TEACHER);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    clearSession();
  });

  it('silently refreshes an expired access token and still restores the session', async () => {
    setTokens('expired-access', 'refresh-1');
    localStorage.setItem('ty_teacher', JSON.stringify(TEACHER));
    const fetchFn = mockFetch((url, init) => {
      const auth = new Headers(init?.headers).get('Authorization');
      if (url.endsWith('/api/auth/refresh')) {
        return jsonResponse(200, {
          access_token: 'fresh-access',
          refresh_token: 'refresh-2',
          expires_in: 900,
        });
      }
      if (url.endsWith('/api/auth/me')) {
        if (auth === 'Bearer expired-access') return jsonResponse(401, { message: 'Invalid or expired token.' });
        if (auth === 'Bearer fresh-access') return jsonResponse(200, { teacher: TEACHER });
        return jsonResponse(401);
      }
      return jsonResponse(404);
    });

    const teacher = await restoreSession();

    // Startup with an expired access token must NOT log the user out —
    // refresh once, then restore.
    expect(teacher).toEqual(TEACHER);
    expect(localStorage.getItem('ty_api_access')).toBe('fresh-access');
    expect(localStorage.getItem('ty_api_refresh')).toBe('refresh-2');
    expect(fetchFn.mock.calls.filter(c => String(c[0]).endsWith('/api/auth/refresh'))).toHaveLength(1);
    clearSession();
  });

  it('resolves null and clears a stale profile when the refresh session is invalid', async () => {
    setTokens('expired-access', 'revoked-refresh');
    localStorage.setItem('ty_teacher', JSON.stringify(TEACHER));
    mockFetch(url => {
      if (url.endsWith('/api/auth/refresh')) {
        return jsonResponse(401, { message: 'Invalid or revoked refresh token.' });
      }
      if (url.endsWith('/api/auth/me')) {
        return jsonResponse(401, { message: 'Invalid or expired token.' });
      }
      return jsonResponse(404);
    });

    const teacher = await restoreSession();

    expect(teacher).toBeNull();
    // Genuinely invalid session → unauthenticated (UI redirects to login),
    // and the stale profile cache must be gone.
    expect(getSession()).toBeNull();
    expect(localStorage.getItem('ty_api_access')).toBeNull();
    expect(localStorage.getItem('ty_api_refresh')).toBeNull();
  });

  it('resolves null immediately without network calls when nothing is persisted', async () => {
    const fetchFn = mockFetch(() => jsonResponse(200, {}));

    const teacher = await restoreSession();

    expect(teacher).toBeNull();
    expect(hasPersistedSession()).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('is one-shot: concurrent callers share a single validation', async () => {
    setTokens('access-1', 'refresh-1');
    localStorage.setItem('ty_teacher', JSON.stringify(TEACHER));
    const fetchFn = mockFetch(url =>
      url.endsWith('/api/auth/me') ? jsonResponse(200, { teacher: TEACHER }) : jsonResponse(404),
    );

    const [a, b, c] = await Promise.all([restoreSession(), restoreSession(), restoreSession()]);

    expect(a).toEqual(TEACHER);
    expect(b).toEqual(TEACHER);
    expect(c).toEqual(TEACHER);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    clearSession();
  });
});
