import type { Teacher } from '@/types';
import { getTeacherByEmail, checkPassword } from './db';

const SESSION_KEY = 'ty_session';

export interface Session {
  teacher: Teacher;
  expires_at: string;
}

export function login(email: string, password: string): Teacher {
  const teacher = getTeacherByEmail(email);
  if (!teacher) throw new Error('Invalid email or password.');
  if (!checkPassword(password, teacher.password_hash)) throw new Error('Invalid email or password.');
  const expires = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(); // 8h
  const session: Session = { teacher, expires_at: expires };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return teacher;
}

export function logout(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function getSession(): Teacher | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session: Session = JSON.parse(raw);
    if (new Date(session.expires_at) < new Date()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session.teacher;
  } catch {
    return null;
  }
}
