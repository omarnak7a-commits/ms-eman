import { useCallback, useSyncExternalStore } from 'react';
import type { Teacher } from '@/types';
import { login as authLogin, logout as authLogout, getSession } from '@/lib/auth';

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
  if (currentTeacher === undefined) currentTeacher = getSession();
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
