/**
 * TEACHER AUTH RECOVERY tests — the real React app in jsdom, driven with real
 * events, against the live FastAPI backend (bridged fetch, see setup.ts).
 *
 * Covers the full recovery contract:
 *   expired session → try refresh → refresh fails → clear stale auth →
 *   redirect /login → log in again → dashboard
 * with NO redirect loops, NO repeated /auth/me or /auth/refresh storms, and
 * never a blank/stuck "Authentication required" state.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { __resetAuthStoreForTests } from '@/hooks/useAuth';

const BACKEND = 'http://127.0.0.1:8000';
const EMAIL = 'ms.eman.zahy@test.com';
const PASSWORD = 'EmanDev2024!';

const ACCESS_KEY = 'ty_api_access';
const REFRESH_KEY = 'ty_api_refresh';
const CACHE_KEY = 'ty_teacher';

// ── Request counters (loop detection) ───────────────────────────────────────
let refreshCalls = 0;
let meCalls = 0;
let dashboardCalls = 0;

const bridgedFetch = globalThis.fetch;
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  if (url.includes('/auth/refresh')) refreshCalls += 1;
  if (url.includes('/auth/me')) meCalls += 1;
  if (url.includes('/dashboard')) dashboardCalls += 1;
  return bridgedFetch(input, init);
}) as typeof fetch;

async function api(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await bridgedFetch(`${BACKEND}/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Log in through the real backend and seed storage exactly like the app. */
async function seedSession() {
  const tokens = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  window.localStorage.setItem(ACCESS_KEY, tokens.access_token);
  window.localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
  const me = await api('GET', '/auth/me', undefined, tokens.access_token);
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(me.teacher));
  return tokens;
}

beforeEach(() => {
  refreshCalls = 0;
  meCalls = 0;
  dashboardCalls = 0;
  // Simulate a fresh page load: the in-memory shared store re-hydrates from
  // storage (setup.ts already cleared localStorage between tests).
  __resetAuthStoreForTests();
});

function goto(path: string) {
  window.history.pushState({}, '', path);
}

async function expectLoginForm() {
  await waitFor(() => expect(window.location.pathname).toBe('/login'), { timeout: 10000 });
  await screen.findByText('Teacher Sign In', undefined, { timeout: 10000 });
}

async function loginThroughForm(email = EMAIL, password = PASSWORD) {
  await userEvent.type(screen.getByLabelText(/email address/i), email);
  await userEvent.type(screen.getByLabelText(/password/i), password);
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
}

// Each test simulates a fresh page load (store reset + explicit storage
// setup), so the sequence covers every recovery branch independently.

describe('Teacher auth recovery (real UI + real backend)', () => {
  it('opening a protected route with a stale cache and NO tokens goes straight to /login', async () => {
    // Simulate: tokens wiped (expired/cleared) but the cached profile left behind.
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ id: 'x', name: 'Ms Eman Zahy', email: EMAIL, role: 'teacher' }),
    );
    goto('/dashboard');
    render(<App />);
    await expectLoginForm();
    // Hydration hygiene: no teacher API round-trip was needed at all.
    expect(dashboardCalls).toBe(0);
    expect(refreshCalls).toBe(0);
  });

  it('normal login lands on the dashboard', async () => {
    goto('/login');
    render(<App />);
    await screen.findByText('Teacher Sign In');
    await loginThroughForm();
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'), { timeout: 10000 });
    await screen.findByText(/welcome back/i, undefined, { timeout: 10000 });
    // Exactly one /auth/me — the one belonging to the login itself.
    expect(meCalls).toBe(1);
  });

  it('page refresh after login keeps the teacher signed in', async () => {
    // Re-seed storage exactly as the app left it after a real login, then
    // simulate a full page reload on the protected route.
    await seedSession();
    goto('/dashboard');
    render(<App />);
    await screen.findByText(/welcome back/i, undefined, { timeout: 10000 });
    expect(window.location.pathname).toBe('/dashboard');
    expect(refreshCalls).toBe(0); // valid access token → no refresh needed
  });

  it('expired access token + valid refresh token recovers transparently and rotates', async () => {
    const tokens = await seedSession();
    // The cache is present too, so the protected page renders immediately
    // and only the API layer notices the dead access token.

    const refreshBefore = window.localStorage.getItem(REFRESH_KEY);
    // Break the access token (simulates the 15-minute TTL expiring).
    window.localStorage.setItem(ACCESS_KEY, 'expired.invalid.token');
    goto('/dashboard');
    render(<App />);
    // The dashboard must recover — no stuck error, no redirect to /login.
    // Wait for real DATA (stats), which only appears after the 401 → refresh
    // → retry round-trip completes.
    await screen.findByText(/total exams/i, undefined, { timeout: 10000 });
    await waitFor(() => expect(refreshCalls).toBe(1), { timeout: 10000 });
    expect(window.location.pathname).toBe('/dashboard');
    // Exactly ONE refresh attempt, and the rotated refresh token was stored
    // (the core regression: before the fix the new token never reached the
    // client, so the NEXT expiry killed the session for good).
    const refreshAfter = window.localStorage.getItem(REFRESH_KEY);
    expect(refreshAfter).toBeTruthy();
    expect(refreshAfter).not.toBe(refreshBefore);
    expect(refreshAfter).not.toBe(tokens.refresh_token);
    expect(window.localStorage.getItem(ACCESS_KEY)).not.toBe('expired.invalid.token');
  });

  it('expired/revoked refresh token clears auth and redirects to /login (no loop)', async () => {
    // Both tokens unusable (access expired, refresh revoked/unknown).
    await seedSession();
    window.localStorage.setItem(ACCESS_KEY, 'expired.invalid.token');
    window.localStorage.setItem(REFRESH_KEY, 'revoked-or-unknown-refresh-token');
    goto('/dashboard');
    render(<App />);
    await expectLoginForm();
    // One refresh attempt, then recovery — never a storm.
    await waitFor(() => expect(refreshCalls).toBe(1), { timeout: 10000 });
    expect(window.localStorage.getItem(ACCESS_KEY)).toBeNull();
    expect(window.localStorage.getItem(REFRESH_KEY)).toBeNull();
    expect(window.localStorage.getItem(CACHE_KEY)).toBeNull();
    // Give any hypothetical redirect loop time to show itself; still /login.
    await new Promise(r => setTimeout(r, 300));
    expect(window.location.pathname).toBe('/login');
    expect(screen.getByText('Teacher Sign In')).toBeTruthy();
  });

  it('invalid credentials show an error and stay on /login', async () => {
    goto('/login');
    render(<App />);
    await screen.findByText('Teacher Sign In');
    await loginThroughForm(EMAIL, 'totally-wrong-password');
    await screen.findByText(/invalid email or password/i, undefined, { timeout: 10000 });
    expect(window.location.pathname).toBe('/login');
    // Failed login must not trigger refresh or invalidation loops.
    expect(refreshCalls).toBe(0);
  });

  it('logout returns to /login and logging in again reaches the dashboard', async () => {
    // Sign back in from the logged-out state.
    goto('/login');
    render(<App />);
    await screen.findByText('Teacher Sign In');
    await loginThroughForm();
    await screen.findByText(/welcome back/i, undefined, { timeout: 10000 });

    // Logout from the dashboard.
    const signOut = screen.getAllByText(/sign out/i)[0];
    await userEvent.click(signOut);
    await expectLoginForm();
    expect(window.localStorage.getItem(CACHE_KEY)).toBeNull();
    expect(window.localStorage.getItem(ACCESS_KEY)).toBeNull();
    expect(window.localStorage.getItem(REFRESH_KEY)).toBeNull();

    // And log in again normally.
    await loginThroughForm();
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'), { timeout: 10000 });
    await screen.findByText(/welcome back/i, undefined, { timeout: 10000 });
  });
});
