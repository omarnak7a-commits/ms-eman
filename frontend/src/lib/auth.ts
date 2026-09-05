/**
 * Teacher session source. Backed by the real API: JWT access + refresh tokens
 * (managed in ./api/client) and a cached teacher profile for immediate render.
 * There is no fake/demo authentication here.
 */
import type { Teacher } from '@/types';
import { login as apiLogin, logout as apiLogout } from './api/auth';
import { getAccessToken } from './api/client';
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
