/**
 * API client + auth token store for the Test Yourself FastAPI backend.
 *
 * Teacher access tokens are short-lived and refresh tokens are rotated on
 * every successful refresh. The refresh path is deliberately single-flight:
 * all requests that discover an expired access token share one refresh request
 * instead of racing a one-time refresh token against each other.
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

// ── Teacher session invalidation ─────────────────────────────────────────────
// When a refresh session is definitively rejected, the React auth store must
// be told as well as the token store. Otherwise ProtectedRoute would continue
// rendering a cached teacher profile whose API calls all return 401.

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
      // A broken listener must never block the request path.
    }
  }
}

// ── Shared token refresh (single in-flight operation) ─────────────────────────

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Refresh the teacher access token. Exactly one refresh runs at a time:
 * concurrent callers share the same in-flight promise.
 */
export function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function doRefresh(): Promise<boolean> {
  // A second attempt handles another browser tab rotating the token while our
  // request was in flight. The current tab's localStorage value is authoritative
  // after that other tab has written its replacement.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const refresh = getRefreshToken();
    if (!refresh) return false;

    try {
      const data = await rawFetch<{ access_token: string; refresh_token?: string }>(
        '/auth/refresh',
        {
          method: 'POST',
          body: { refresh_token: refresh },
          // The refresh endpoint is intentionally unauthenticated. Do not send
          // the expired access token just because this is a teacher request.
          auth: null,
        },
      );

      if (typeof data?.access_token !== 'string' || !data.access_token) {
        // A malformed success is not evidence that the stored session is
        // revoked. Keep the session so a later request can retry safely.
        return false;
      }

      // The current backend always returns refresh_token. Keeping the old value
      // is a compatibility fallback for an older deployment; the new backend
      // rotates it and therefore takes this branch on every successful refresh.
      storageSet(ACCESS_KEY, data.access_token);
      if (typeof data.refresh_token === 'string' && data.refresh_token) {
        storageSet(REFRESH_KEY, data.refresh_token);
      }
      return true;
    } catch (error) {
      const status = (error as ApiError)?.status;

      // Network errors and 5xx responses are transient. Do not log a teacher
      // out just because the API is temporarily unavailable.
      if (status !== 401) return false;

      const currentRefresh = getRefreshToken();
      if (attempt === 0 && currentRefresh && currentRefresh !== refresh) {
        // Another tab successfully rotated the old token while this request
        // was running. Retry once with the token it stored.
        continue;
      }

      // Only clear the session if the exact token we tried is still current.
      // A newer login or a successful cross-tab rotation must win over this
      // stale refresh failure.
      if (currentRefresh === refresh) {
        invalidateTeacherSession();
      }
      return false;
    }
  }

  return false;
}

// ── Request pipeline ─────────────────────────────────────────────────────────

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
  let originalError: unknown;

  try {
    return await rawFetch<T>(path, opts);
  } catch (error) {
    if (!isTeacher || (error as ApiError)?.status !== 401) throw error;
    originalError = error;
  }

  // Student-attempt and public requests never enter this branch. Teacher 401s
  // get exactly one refresh-and-retry cycle.
  const refreshBefore = getRefreshToken();
  if (refreshBefore) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const refreshAfter = getRefreshToken();
      try {
        return await rawFetch<T>(path, opts);
      } catch (retryError) {
        if ((retryError as ApiError)?.status !== 401) throw retryError;
        // Do not invalidate a different session that replaced ours while the
        // retry was in flight.
        if (getRefreshToken() === refreshAfter) {
          invalidateTeacherSession();
        }
        throw retryError;
      }
    }

    // A definitive 401 is invalidated by doRefresh(). A transient failure
    // leaves the tokens untouched so a later request can try again. In both
    // cases the caller receives the original API error.
    throw originalError;
  }

  // No refresh token means this teacher request cannot be recovered. If a
  // concurrent logout/new login already changed storage, its auth store wins;
  // otherwise clear the stale profile and notify the router.
  invalidateTeacherSession();
  throw originalError;
}
