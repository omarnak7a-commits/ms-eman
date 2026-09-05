/**
 * useAuth lifecycle tests: AUTH_INITIALIZING → AUTHENTICATED / UNAUTHENTICATED,
 * plus mid-session invalidation (refresh failed) logging the UI out.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAuth } from './useAuth';
import { setTokens } from '@/lib/api/client';
import { request } from '@/lib/api/client';

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

function seedValidSession() {
  setTokens('access-1', 'refresh-1');
  localStorage.setItem('ty_teacher', JSON.stringify(TEACHER));
}

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('useAuth()', () => {
  it('restores a persisted session: initializing → authenticated', async () => {
    seedValidSession();
    mockFetch(url => (url.endsWith('/api/auth/me') ? jsonResponse(200, { teacher: TEACHER }) : jsonResponse(404)));

    const { result } = renderHook(() => useAuth());

    // While restoring: the app is AUTH_INITIALIZING, not "logged out".
    expect(result.current.initializing).toBe(true);
    expect(result.current.isAuthenticated).toBe(true); // cached profile for first paint

    await waitFor(() => expect(result.current.initializing).toBe(false));
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.teacher).toEqual(TEACHER);
  });

  it('starts unauthenticated immediately when nothing is persisted', async () => {
    const fetchFn = mockFetch(() => jsonResponse(200, {}));
    const { result } = renderHook(() => useAuth());

    expect(result.current.initializing).toBe(false);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.teacher).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('ends up unauthenticated (→ login redirect) when the session is genuinely invalid', async () => {
    seedValidSession();
    mockFetch(url => {
      if (url.endsWith('/api/auth/refresh')) return jsonResponse(401, { message: 'Invalid or revoked refresh token.' });
      if (url.endsWith('/api/auth/me')) return jsonResponse(401, { message: 'Invalid or expired token.' });
      return jsonResponse(404);
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.initializing).toBe(true); // still validating…
    await waitFor(() => expect(result.current.initializing).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.teacher).toBeNull();
    expect(localStorage.getItem('ty_teacher')).toBeNull(); // stale cache cleared
  });

  it('logs the UI out when the API layer invalidates a mid-session refresh', async () => {
    seedValidSession();
    const fetchFn = mockFetch((url, init) => {
      const auth = new Headers(init?.headers).get('Authorization');
      if (url.endsWith('/api/auth/me')) {
        return auth === 'Bearer access-1'
          ? jsonResponse(200, { teacher: TEACHER })
          : jsonResponse(401);
      }
      if (url.endsWith('/api/auth/refresh')) return jsonResponse(401, { message: 'Invalid or revoked refresh token.' });
      return jsonResponse(401, { message: 'Authentication required.' });
    });

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.initializing).toBe(false));
    expect(result.current.isAuthenticated).toBe(true);

    // A protected API call fails and the (revoked) refresh token cannot
    // extend the session → the UI must log out, not keep a broken session.
    await act(async () => {
      await expect(request('/dashboard')).rejects.toMatchObject({ status: 401 });
    });

    await waitFor(() => expect(result.current.isAuthenticated).toBe(false));
    expect(result.current.teacher).toBeNull();
    expect(localStorage.getItem('ty_teacher')).toBeNull();
    expect(localStorage.getItem('ty_api_access')).toBeNull();
    void fetchFn;
  });

  it('login() authenticates and logout() de-authenticates', async () => {
    mockFetch(url => {
      if (url.endsWith('/api/auth/login')) {
        return jsonResponse(200, { access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 900 });
      }
      if (url.endsWith('/api/auth/me')) return jsonResponse(200, { teacher: TEACHER });
      if (url.endsWith('/api/auth/logout')) return jsonResponse(200, { message: 'Logged out.' });
      return jsonResponse(404);
    });

    const { result } = renderHook(() => useAuth());
    expect(result.current.isAuthenticated).toBe(false);

    await act(async () => {
      await result.current.login(TEACHER.email, 'password123');
    });
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.teacher).toEqual(TEACHER);

    await act(async () => {
      await result.current.logout();
    });
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.teacher).toBeNull();
    expect(localStorage.getItem('ty_teacher')).toBeNull();
    expect(localStorage.getItem('ty_api_access')).toBeNull();
  });
});
