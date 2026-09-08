/**
 * Teacher session source. Backed by the real API: JWT access + refresh tokens
 * (managed in ./api/client) and a cached teacher profile for immediate render.
 * There is no fake/demo authentication here.
 *
 * On a full page load, `restoreSession()` validates the persisted profile with
 * GET /auth/me. An expired access token is transparently refreshed by the API
 * client before that validation completes. The caller can therefore distinguish
 * "still restoring" from a genuinely signed-out teacher.
 */
import type { Teacher } from '@/types';
import { login as apiLogin, logout as apiLogout, me as apiMe } from './api/auth';
import { getAccessToken, getRefreshToken } from './api/client';
import { storageGet, storageRemove, storageSet } from './storage';

const CACHE_KEY = 'ty_teacher';

function readCache(): Teacher | null {
  try {
    const raw = storageGet(CACHE_KEY);
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

/** Whether there is anything that can be restored on this page load. */
export function hasPersistedSession(): boolean {
  return !!readCache() || !!getAccessToken() || !!getRefreshToken();
}

let restorePromise: Promise<Teacher | null> | null = null;

/**
 * Validate and restore the persisted teacher session once per page load.
 * Concurrent callers share the same request. A temporary network/server
 * failure keeps an already-cached profile available; the API client itself
 * clears it when the backend definitively rejects the refresh session.
 */
export function restoreSession(): Promise<Teacher | null> {
  if (restorePromise) return restorePromise;

  const promise = (async () => {
    if (!getAccessToken() && !getRefreshToken()) {
      // A profile without either token is stale and cannot authenticate.
      clearSession();
      return null;
    }

    try {
      const response = await apiMe();
      storageSet(CACHE_KEY, JSON.stringify(response.teacher));
      return response.teacher;
    } catch {
      // For a definitive 401, request() has already invalidated the token and
      // the shared auth store will remove the profile. For a transient network
      // or 5xx failure, retain the cached profile for a later retry.
      if (!getAccessToken() && !getRefreshToken()) {
        clearSession();
        return null;
      }
      return readCache();
    }
  })();

  restorePromise = promise;
  return promise;
}

/** Test-only reset; a real page load gets a fresh module instance. */
export function resetSessionRestoreForTests(): void {
  restorePromise = null;
}

export async function login(email: string, password: string): Promise<Teacher> {
  const teacher = await apiLogin(email, password);
  storageSet(CACHE_KEY, JSON.stringify(teacher));
  return teacher;
}

export async function logout(): Promise<void> {
  try {
    await apiLogout();
  } finally {
    storageRemove(CACHE_KEY);
  }
}

export function clearSession(): void {
  storageRemove(CACHE_KEY);
}
