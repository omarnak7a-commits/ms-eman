/**
 * Teacher session source. Backed by the real API: JWT access + refresh tokens
 * (managed in ./api/client) and a cached teacher profile for immediate render.
 * There is no fake/demo authentication here.
 *
 * Session restoration (`restoreSession`):
 * On app startup the UI is in AUTH_INITIALIZING until this function has checked
 * the persisted session against the backend (`GET /auth/me`). It runs at most
 * once per page load; concurrent callers share the same promise. The call goes
 * through the API client, so an expired access token is silently refreshed
 * first (single shared refresh) and the session is still restored.
 */
import type { Teacher } from '@/types';
import { login as apiLogin, logout as apiLogout, me as apiMe } from './api/auth';
import { getAccessToken, getRefreshToken, onAuthInvalidated } from './api/client';

const CACHE_KEY = 'ty_teacher';

function readCache(): Teacher | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Teacher;
  } catch {
    return null;
  }
}

/** Synchronous teacher profile for first render (cached after a real login). */
export function getSession(): Teacher | null {
  return readCache();
}

export function hasAccessToken(): boolean {
  return !!getAccessToken();
}

export function hasPersistedSession(): boolean {
  return !!readCache() || !!getAccessToken() || !!getRefreshToken();
}

/**
 * Restore + validate the persisted session against the backend, once per page
 * load. Resolves with the teacher profile when the session is valid (refreshing
 * an expired access token first if needed), or `null` when it is not.
 */
let restorePromise: Promise<Teacher | null> | null = null;

export function restoreSession(): Promise<Teacher | null> {
  if (!restorePromise) {
    const p = (async () => {
      if (!getAccessToken() && !getRefreshToken()) {
        clearSession(); // profile cache without any token is stale
        return null;
      }
      try {
        const me = await apiMe();
        localStorage.setItem(CACHE_KEY, JSON.stringify(me.teacher));
        return me.teacher;
      } catch {
        clearSession();
        return null;
      }
    })();
    restorePromise = p;
    // One-shot: allow a fresh restore on a later page load / new tab.
    p.finally(() => {
      if (restorePromise === p) restorePromise = null;
    });
  }
  return restorePromise;
}

// Keep the synchronous profile cache consistent when the API layer declares
// the session dead (refresh failed definitively). Components that read
// getSession() directly (e.g. TeacherLayout) then stop claiming auth.
onAuthInvalidated(clearSession);

export async function login(email: string, password: string): Promise<Teacher> {
  const teacher = await apiLogin(email, password);
  localStorage.setItem(CACHE_KEY, JSON.stringify(teacher));
  return teacher;
}

export async function logout(): Promise<void> {
  try {
    await apiLogout();
  } finally {
    localStorage.removeItem(CACHE_KEY);
  }
}

export function clearSession(): void {
  localStorage.removeItem(CACHE_KEY);
}
