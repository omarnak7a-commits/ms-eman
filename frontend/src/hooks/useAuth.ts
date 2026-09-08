import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { Teacher } from '@/types';
import {
  login as authLogin,
  logout as authLogout,
  getSession,
  clearSession as authClearSession,
  hasPersistedSession,
  restoreSession,
  resetSessionRestoreForTests,
} from '@/lib/auth';
import { getAccessToken, getRefreshToken, onTeacherSessionInvalidated } from '@/lib/api/client';

interface AuthSnapshot {
  teacher: Teacher | null;
  initializing: boolean;
}

/**
 * Teacher session, held in one module-level store shared by every `useAuth()`
 * caller. Both the login page and ProtectedRoute therefore observe the same
 * transition, including an invalid refresh session.
 */
let snapshot: AuthSnapshot | undefined;
let authGeneration = 0;
const listeners = new Set<() => void>();

function getSnapshot(): AuthSnapshot {
  if (!snapshot) {
    let teacher: Teacher | null;
    // A cached profile without either token can never authenticate. Drop it
    // before deciding whether the app needs an async restore pass.
    if (!getAccessToken() && !getRefreshToken()) {
      authClearSession();
      teacher = null;
    } else {
      teacher = getSession();
    }

    snapshot = {
      teacher,
      initializing: hasPersistedSession(),
    };
  }
  return snapshot;
}

function publish(next: AuthSnapshot): void {
  const previous = snapshot;
  if (previous && previous.teacher === next.teacher && previous.initializing === next.initializing) {
    return;
  }
  snapshot = next;
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// If the API layer definitively rejects a refresh token, clear the cached
// profile and move every mounted auth consumer to the signed-out state.
onTeacherSessionInvalidated(() => {
  authGeneration += 1;
  authClearSession();
  publish({ teacher: null, initializing: false });
});

/**
 * Test seam: simulate a full page load by discarding the module-level snapshot
 * and the one-shot restore promise. Production page loads get a fresh module
 * instance, so this is not part of the runtime auth flow.
 */
export function __resetAuthStoreForTests(): void {
  authGeneration += 1;
  snapshot = undefined;
  resetSessionRestoreForTests();
  for (const listener of [...listeners]) listener();
}

export function useAuth() {
  const auth = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    const current = getSnapshot();
    if (!current.initializing) return;

    const generation = authGeneration;
    restoreSession().then(teacher => {
      // A login/logout that completed while restoration was in flight owns the
      // store and must not be overwritten by the stale restore result.
      if (generation !== authGeneration) return;
      publish({ teacher, initializing: false });
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const teacher = await authLogin(email, password);
    authGeneration += 1;
    publish({ teacher, initializing: false });
    return teacher;
  }, []);

  const logout = useCallback(async () => {
    // Cancel an in-flight restore before revoking the current session.
    authGeneration += 1;
    try {
      await authLogout();
    } finally {
      publish({ teacher: null, initializing: false });
    }
  }, []);

  return {
    teacher: auth.teacher,
    login,
    logout,
    isAuthenticated: !!auth.teacher,
    initializing: auth.initializing,
  };
}
