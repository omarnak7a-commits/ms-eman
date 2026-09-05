/**
 * API client + auth token store for the Test Yourself FastAPI backend.
 *
 * Token refresh rules (see `refreshAccessToken`):
 * - The backend ROTATES refresh tokens: the presented refresh token is revoked
 *   and a new one is returned. The client must persist BOTH new tokens; the
 *   old refresh token is dead and must never be retried.
 * - A single shared in-flight refresh (`refreshInFlight`) guarantees that any
 *   number of concurrent 401s triggers exactly ONE refresh request. All
 *   concurrent callers await the same promise (no refresh stampede — with
 *   rotation, a second concurrent refresh would fail and wipe the session).
 * - A request that gets 401 is retried exactly ONCE after a successful
 *   refresh; no infinite retry loops.
 * - If the refresh definitively fails (401), the stored tokens are cleared
 *   and `onAuthInvalidated` listeners are notified so the UI can log the
 *   user out and redirect to login. Listeners fire only when the token we
 *   tried is still the one stored (a newer login in the meantime wins).
 * - Transient failures (network errors, 5xx) do NOT clear the session.
 */

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
  return localStorage.getItem(ACCESS_KEY);
}
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}
export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}
export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

// ── Auth invalidation listeners ─────────────────────────────────────────────
// The UI (React) subscribes so that a definitively failed refresh — e.g. the
// refresh session itself is expired/revoked — clears the teacher profile and
// redirects to login instead of leaving a broken "authenticated" screen.
type AuthInvalidatedListener = () => void;
const authInvalidatedListeners = new Set<AuthInvalidatedListener>();

/** Subscribe to "the teacher session was definitively invalidated". Returns an unsubscribe function. */
export function onAuthInvalidated(fn: AuthInvalidatedListener): () => void {
  authInvalidatedListeners.add(fn);
  return () => {
    authInvalidatedListeners.delete(fn);
  };
}

function emitAuthInvalidated(): void {
  for (const fn of [...authInvalidatedListeners]) {
    try {
      fn();
    } catch {
      /* a listener error must never break the request path */
    }
  }
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

// ── Shared token refresh (single in-flight operation) ───────────────────────

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Refresh the teacher access token. Exactly one refresh runs at a time:
 * concurrent callers share the same in-flight promise.
 *
 * Returns `true` when a fresh access token is available afterwards.
 */
export function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      // Release the lock so a later expiry can refresh again.
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function doRefresh(): Promise<boolean> {
  // Two attempts max: if the first attempt is rejected because a sibling
  // browser tab (localStorage is shared) already rotated the refresh token,
  // retry once with the fresh token that is now stored.
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = getRefreshToken();
    if (!token) return false;
    try {
      const data = await rawFetch<{ access_token: string; refresh_token?: string }>(
        '/auth/refresh',
        { method: 'POST', body: { refresh_token: token }, auth: null },
      );
      // Persist the new access token and the ROTATED refresh token. (If an
      // older backend ever omits refresh_token, keep the stored one — the
      // current backend always returns it.)
      if (data.refresh_token) {
        setTokens(data.access_token, data.refresh_token);
      } else {
        localStorage.setItem(ACCESS_KEY, data.access_token);
      }
      return true;
    } catch (err) {
      const status = (err as ApiError)?.status;
      if (status !== 401) {
        // Network error / 5xx: the session may still be valid — do NOT clear
        // it, just report failure for this refresh attempt.
        return false;
      }
      const nowStored = getRefreshToken();
      if (attempt === 0 && nowStored && nowStored !== token) continue; // rotated by another tab
      if (nowStored === token) {
        // Definitive: the refresh token the user still holds is invalid on
        // the backend (revoked/expired/logout). No newer login replaced it,
        // so clear the session and tell the UI.
        clearTokens();
        emitAuthInvalidated();
      }
      return false;
    }
  }
  return false;
}

// ── Request pipeline ────────────────────────────────────────────────────────

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
  try {
    return await rawFetch<T>(path, opts);
  } catch (err) {
    if (!isTeacher) throw err;
    // Teacher token may have expired → run the single shared refresh, then
    // retry the original request exactly once.
    if ((err as ApiError)?.status === 401 && getRefreshToken()) {
      const ok = await refreshAccessToken();
      if (ok) {
        return await rawFetch<T>(path, opts);
      }
      // Refresh failed: tokens already cleared + UI notified (→ redirect to
      // login) when the failure was definitive. Re-throw the original 401 so
      // the caller sees the same error as before the refresh attempt.
    }
    throw err;
  }
}
