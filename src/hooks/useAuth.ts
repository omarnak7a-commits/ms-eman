import { useState, useEffect, useCallback } from 'react';
import type { Teacher } from '@/types';
import {
  login as authLogin,
  logout as authLogout,
  getSession,
  hasPersistedSession,
  restoreSession,
} from '@/lib/auth';
import { onAuthInvalidated } from '@/lib/api/client';

/**
 * Three auth states:
 * - initializing: a persisted session exists and is being validated against
 *   the backend (never render protected pages or redirect to login yet).
 * - authenticated: session validated (or fresh login).
 * - unauthenticated: no session, or validation/refresh definitively failed.
 */
export function useAuth() {
  const [teacher, setTeacher] = useState<Teacher | null>(() => getSession());
  const [initializing, setInitializing] = useState<boolean>(() => hasPersistedSession());

  // Validate/restore the persisted session exactly once per page load
  // (restoreSession is one-shot and shared across components).
  useEffect(() => {
    if (!hasPersistedSession()) {
      setInitializing(false);
      return;
    }
    let cancelled = false;
    restoreSession().then(t => {
      if (cancelled) return;
      setTeacher(t);
      setInitializing(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // If the API layer definitively invalidates the session (e.g. the refresh
  // token is revoked/expired while the user is mid-session), log the UI out
  // immediately → ProtectedRoute redirects to /login.
  useEffect(
    () =>
      onAuthInvalidated(() => {
        setTeacher(null);
        setInitializing(false);
      }),
    [],
  );

  const login = useCallback(async (email: string, password: string) => {
    const t = await authLogin(email, password);
    setTeacher(t);
    setInitializing(false);
    return t;
  }, []);

  const logout = useCallback(async () => {
    await authLogout();
    setTeacher(null);
    setInitializing(false);
  }, []);

  return { teacher, login, logout, isAuthenticated: !!teacher, initializing };
}
