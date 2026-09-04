/**
 * API client + auth token store for the Test Yourself FastAPI backend.
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

export async function refreshAccessToken(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  try {
    const data = await rawFetch<{ access_token: string }>('/auth/refresh', {
      method: 'POST',
      body: { refresh_token: refresh },
    });
    localStorage.setItem(ACCESS_KEY, data.access_token);
    return true;
  } catch {
    clearTokens();
    return false;
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
  try {
    return await rawFetch<T>(path, opts);
  } catch (err) {
    // Teacher token may have expired → refresh once and retry.
    if (isTeacher && (err as ApiError)?.status === 401 && getRefreshToken()) {
      const ok = await refreshAccessToken();
      if (ok) {
        return await rawFetch<T>(path, opts);
      }
      clearTokens();
    }
    throw err;
  }
}
