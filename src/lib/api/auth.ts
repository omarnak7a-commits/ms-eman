import type { Teacher } from '@/types';
import { request, setTokens, clearTokens, getRefreshToken } from './client';

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export async function login(email: string, password: string): Promise<Teacher> {
  const tokens = await request<TokenPair>('/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: null,
  });
  setTokens(tokens.access_token, tokens.refresh_token);
  const me = await request<{ teacher: Teacher }>('/auth/me');
  return me.teacher;
}

export async function me(): Promise<{ teacher: Teacher }> {
  return request<{ teacher: Teacher }>('/auth/me');
}

export async function changePassword(
  current_password: string,
  new_password: string,
): Promise<void> {
  await request('/auth/change-password', {
    method: 'POST',
    body: { current_password, new_password },
  });
}

export async function logout(): Promise<void> {
  const refresh = getRefreshToken();
  try {
    if (refresh) {
      await request('/auth/logout', {
        method: 'POST',
        body: { refresh_token: refresh },
        auth: null,
      });
    }
  } finally {
    clearTokens();
  }
}
