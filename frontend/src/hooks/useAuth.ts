import { useCallback, useSyncExternalStore } from 'react';
import type { Teacher } from '@/types';
import {
  login as authLogin,
  logout as authLogout,
  getSession,
  clearSession as authClearSession,
} from '@/lib/auth';
import { getAccessToken, getRefreshToken, onTeacherSessionInvalidated } from '@/lib/api/client';

/**
 * Teacher session, held in ONE module-level store shared by every `useAuth()`
 * caller.
 *
 * This used to be component-local `useState`, which meant `AppRoutes` (whose
 * value drives `ProtectedRoute`) and `LoginPage` each owned a *separate* copy
 * of the session. After a successful sign-in only LoginPage's copy flipped to
 * authenticated, so the two disagreed:
 *
 *   LoginPage       -> <Navigate to="/dashboard" replace />   (I am signed in)
 *   ProtectedRoute  -> <Navigate to="/login" replace />       (no, you're not)
 *
 * React Router bounced between the two redirects and committed an empty tree:
 * a completely blank page with the URL still on /login and no error in the
 * console. It only reproduced on a device that did NOT already have a cached
 * session in localStorage — i.e. never on the desktop that had been logged in
 * for weeks, and every single time on a phone signing in for the first time.
 *
 * A single shared store removes the disagreement: both call sites read the
 * same snapshot and re-render together.
 */

let currentTeacher: Teacher | null | undefined;
const listeners = new Set<() => void>();

function getSnapshot(): Teacher | null {
  // Lazily hydrate from the cached profile on first read, then keep a stable
  // reference so useSyncExternalStore does not loop.
  if (currentTeacher === undefined) {
    // Stale-cache hygiene: a cached profile with NO tokens left in storage
    // (tokens cleared, private-browsing tab loss, manual wipe) can never
    // authenticate. Treat it as signed out immediately instead of letting
    // every protected page mount and 401 first.
    if (!getAccessToken() && !getRefreshToken()) {
      authClearSession();
      currentTeacher = null;
    } else {
      currentTeacher = getSession();
    }
  }
  return currentTeacher;
}

function setTeacher(next: Teacher | null): void {
  currentTeacher = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// When the API layer decides a teacher session is unrecoverable (401 with no
// working refresh), it fires this hook. Resetting the SHARED store here is
// what flips ProtectedRoute to signed-out and routes the teacher to /login —
// and what guarantees the login page never bounces back to /dashboard.
onTeacherSessionInvalidated(() => {
  authClearSession();
  setTeacher(null);
});

/**
 * Test seam only: forget the in-memory session so the next snapshot read
 * re-hydrates from storage — exactly what a real page reload does. Without
 * this, jsdom tests would share one store across simulated "page loads".
 */
export function __resetAuthStoreForTests(): void {
  currentTeacher = undefined;
  for (const listener of listeners) listener();
}

export function useAuth() {
  const teacher = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const login = useCallback(async (email: string, password: string) => {
    const t = await authLogin(email, password);
    setTeacher(t);
    return t;
  }, []);

  const logout = useCallback(async () => {
    await authLogout();
    setTeacher(null);
  }, []);

  return { teacher, login, logout, isAuthenticated: !!teacher };
}
