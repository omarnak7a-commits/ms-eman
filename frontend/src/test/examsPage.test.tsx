/**
 * TEACHER EXAMS PAGE responsive UI tests — the real React app in jsdom,
 * driven with real events against the live FastAPI backend (bridged fetch).
 *
 * jsdom has no layout engine, so the mobile-first card structure is asserted
 * via the DOM contract of the page:
 *   - every exam renders as a row/card carrying title + badge + metadata
 *   - the desktop action bar (Edit / Copy Link / …) and the mobile overflow
 *     menu (⋮) are both present per exam
 *   - on mobile the overflow menu exposes Preview / Results / Duplicate and a
 *     red Delete, and the delete confirmation dialog still deletes for real.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { __resetAuthStoreForTests } from '@/hooks/useAuth';

const BACKEND = 'http://127.0.0.1:8000';
const RUN = Date.now();
const EMAIL = 'ms.eman.zahy@test.com';
const PASSWORD = 'EmanDev2024!';

const ACCESS_KEY = 'ty_api_access';
const REFRESH_KEY = 'ty_api_refresh';
const CACHE_KEY = 'ty_teacher';

async function api(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BACKEND}/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}

let teacherToken = '';

/** Log in through the real backend and store tokens like the app does. */
async function seedSession() {
  const tokens = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  teacherToken = tokens.access_token;
  window.localStorage.setItem(ACCESS_KEY, tokens.access_token);
  window.localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
  const me = await api('GET', '/auth/me', undefined, teacherToken);
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(me.teacher));
}

async function createExam(title: string) {
  const exam = await api('POST', '/exams', {
    title,
    duration_minutes: 30,
    ranking_enabled: true,
    result_visibility: true,
    review_visibility: true,
  }, teacherToken);
  return exam as { id: string; title: string };
}

async function renderExamsPage() {
  window.history.pushState({}, '', '/exams');
  render(<App />);
  // Wait for the Exams page heading (list data may still be loading).
  await screen.findByRole('heading', { name: 'Exams' }, { timeout: 10000 });
}

/** The article DOM node wrapping a given exam row/card. */
function examCard(title: string): HTMLElement {
  const titleLink = screen.getByRole('link', { name: title });
  const article = titleLink.closest('article');
  if (!article) throw new Error(`No exam card found for "${title}"`);
  return article;
}

beforeEach(() => {
  // Simulate a fresh page load: the in-memory shared store re-hydrates from
  // storage (setup.ts already cleared localStorage between tests).
  __resetAuthStoreForTests();
});

describe('Teacher Exams page — responsive list UI', () => {
  it('renders each exam with metadata, desktop actions and a mobile overflow menu', async () => {
    await seedSession();
    const title = `Exams UI Row ${RUN}`;
    await createExam(title);

    await renderExamsPage();
    const article = await waitFor(() => examCard(title), { timeout: 10000 });

    // Title + status badge + the usual metadata are all inside the card.
    expect(within(article).getByText('draft')).toBeTruthy();
    expect(within(article).getByText('0 questions')).toBeTruthy();
    expect(within(article).getByText('30 min')).toBeTruthy();
    expect(within(article).getByText('0 attempts')).toBeTruthy();

    // Desktop action bar and mobile-first actions coexist in the DOM:
    // the desktop "Edit" link, and the mobile Copy Link + ⋮ overflow trigger.
    expect(within(article).getAllByRole('link', { name: 'Edit' }).length).toBeGreaterThan(0);
    expect(
      within(article).getAllByRole('button', { name: 'Copy Link' }).length,
    ).toBeGreaterThan(0);
    expect(
      within(article).getByRole('button', { name: `More actions for ${title}` }),
    ).toBeTruthy();
  });

  it('mobile overflow menu exposes Preview, Duplicate and Delete; desktop bar keeps Results hidden for drafts', async () => {
    await seedSession();
    const title = `Exams UI Menu ${RUN}`;
    await createExam(title);

    await renderExamsPage();
    const article = await waitFor(() => examCard(title), { timeout: 10000 });

    // Drafts get no Results quick action.
    expect(within(article).queryByRole('link', { name: 'Results' })).toBeNull();

    // Open the ⋮ menu for this exam.
    await userEvent.click(
      within(article).getByRole('button', { name: `More actions for ${title}` }),
    );

    const menu = within(article).getByRole('menu');
    const previewItem = within(menu).getByRole('menuitem', { name: 'Preview' });
    expect((previewItem as HTMLAnchorElement).getAttribute('href')).toMatch(/\/preview$/);
    expect(within(menu).getByRole('menuitem', { name: 'Duplicate' })).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: 'Delete' })).toBeTruthy();
    // Results only appears for non-draft exams.
    expect(within(menu).queryByRole('menuitem', { name: 'Results' })).toBeNull();
  });

  it('deletes an exam through the mobile overflow menu + confirmation dialog', async () => {
    await seedSession();
    const title = `Exams UI Delete ${RUN}`;
    const exam = await createExam(title);

    await renderExamsPage();
    const article = await waitFor(() => examCard(title), { timeout: 10000 });

    await userEvent.click(
      within(article).getByRole('button', { name: `More actions for ${title}` }),
    );
    await userEvent.click(within(article).getByRole('menuitem', { name: 'Delete' }));

    // Confirmation dialog opens with the exam name, stays readable and
    // confirms against the real DELETE endpoint.
    const dialog = await screen.findByRole('dialog', { name: 'Delete Exam' }, { timeout: 10000 });
    expect(within(dialog).getByText(new RegExp(title))).toBeTruthy();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    // Deletion is fire-and-forget from the click (the page reloads itself), so
    // wait on the SERVER state and the refreshed UI inside one act-wrapped
    // poll — the exam card must disappear AND the exam must really be gone.
    await waitFor(async () => {
      const list = await api('GET', '/exams', undefined, teacherToken) as Array<{ id: string }>;
      expect(list.some(e => e.id === exam.id)).toBe(false);
      expect(screen.queryByText(title)).toBeNull();
    }, { timeout: 10000 });
  });
});
