/**
 * API client + auth token store for the Test Yourself FastAPI backend.
 */

import { storageGet, storageRemove, storageSet } from '@/lib/storage';

export interface ApiError {
  status: number;
  code?: string;
  message: string;
}

const API_BASE: string =
  import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? '/api';

// Teacher session tokens.
const ACCESS_KEY = 'ty_api_access';
const REFRESH_KEY = 'ty_api_refresh';

export function getAccessToken(): string | null {
  return storageGet(ACCESS_KEY);
}
export function getRefreshToken(): string | null {
  return storageGet(REFRESH_KEY);
}
export function setTokens(access: string, refresh: string): void {
  storageSet(ACCESS_KEY, access);
  storageSet(REFRESH_KEY, refresh);
}
export function clearTokens(): void {
  storageRemove(ACCESS_KEY);
  storageRemove(REFRESH_KEY);
}

async function parseError(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`;
  let code: string | undefined;
  try {
    const body = await res.json();
    if (body?.message) message = body.message;
    else if (body?.detail) message = body.detail;
    code = body?.code;
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, code, message };
}

// Refresh tokens are ROTATED server-side: every successful refresh revokes the
// presented token and returns a fresh one. Both tokens must therefore be
// persisted on every refresh, otherwise the next refresh attempt presents an
// already-revoked token and the teacher's session dies mid-work.

/** Single-flight guard: parallel 401s must trigger ONE refresh, not N
 * competing ones (rotation would revoke the token under the other callers). */
let refreshInFlight: Promise<boolean> | null = null;

export function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = doRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function doRefresh(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  try {
    const data = await rawFetch<{ access_token: string; refresh_token?: string }>(
      '/auth/refresh',
      {
        method: 'POST',
        body: { refresh_token: refresh },
      },
    );
    if (typeof data?.access_token !== 'string' || !data.access_token) {
      clearTokens();
      return false;
    }
    storageSet(ACCESS_KEY, data.access_token);
    if (typeof data.refresh_token === 'string' && data.refresh_token) {
      storageSet(REFRESH_KEY, data.refresh_token);
    }
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

// ── Teacher session invalidation ─────────────────────────────────────────────
// When a teacher 401 cannot be recovered via refresh, the stale client state
// (cached profile + shared auth store) must be torn down too — otherwise
// ProtectedRoute keeps rendering teacher pages that only ever say
// "Authentication required". Registered listeners (the shared auth store in
// useAuth) clear the cached profile and reset to signed-out, which makes the
// router redirect to /login. Listeners must stay side-effect-light (no
// network calls) so this can never start a request loop.

export type SessionInvalidatedListener = () => void;
const sessionInvalidatedListeners = new Set<SessionInvalidatedListener>();

export function onTeacherSessionInvalidated(listener: SessionInvalidatedListener): () => void {
  sessionInvalidatedListeners.add(listener);
  return () => {
    sessionInvalidatedListeners.delete(listener);
  };
}

export function invalidateTeacherSession(): void {
  clearTokens();
  for (const listener of [...sessionInvalidatedListeners]) {
    try {
      listener();
    } catch {
      /* a broken listener must never block session recovery */
    }
  }
}

interface Options {
  method?: string;
  body?: unknown;
  auth?: 'teacher' | 'student' | null;
  token?: string;
}

async function rawFetch<T>(path: string, opts: Options): Promise<T> {
  const { method = 'GET', body, auth = 'teacher', token } = opts;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const bearer = auth === 'student' ? token : auth === 'teacher' ? getAccessToken() : null;
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    throw await parseError(res);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function request<T>(path: string, opts: Options = {}): Promise<T> {
  const isTeacher = opts.auth !== 'student' && opts.auth !== null;
  let err: unknown;
  try {
    return await rawFetch<T>(path, opts);
  } catch (e) {
    if (!isTeacher || (e as ApiError)?.status !== 401) throw e;
    err = e;
  }

  // Teacher request was rejected (expired/invalid access token or no token at
  // all). Attempt ONE refresh-and-retry when a refresh token exists.
  if (getRefreshToken()) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      try {
        return await rawFetch<T>(path, opts);
      } catch (retryErr) {
        if ((retryErr as ApiError)?.status !== 401) throw retryErr;
        err = retryErr; // fall through → the session is unrecoverable
      }
    }
  }

  // The session cannot be restored: clear the tokens AND notify the shared
  // auth store so the cached profile is dropped and the teacher is routed to
  // /login instead of being stuck on a protected page.
  invalidateTeacherSession();
  throw err;
}
