import { useState, useCallback } from 'react';
import type { Teacher } from '@/types';
import { login as authLogin, logout as authLogout, getSession } from '@/lib/auth';

export function useAuth() {
  const [teacher, setTeacher] = useState<Teacher | null>(() => getSession());

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
