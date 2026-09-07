/**
 * E2E tests for Ordering Enhancements:
 * - Multiple valid correct orders
 * - First word indicator in teacher editor, preview, and student flow
 * - Correct answer feedback with multiple accepted answers
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { __resetAuthStoreForTests } from '@/hooks/useAuth';
import { setAttemptToken } from '@/lib/api/attempts';

const BACKEND = 'http://127.0.0.1:8000';
const RUN = Date.now();
const TEACHER_EMAIL = 'ms.eman.zahy@test.com';
const TEACHER_PASSWORD = 'EmanDev2024!';

const ACCESS_KEY = 'ty_api_access';
const REFRESH_KEY = 'ty_api_refresh';
const CACHE_KEY = 'ty_teacher';

let teacherToken = '';
let examId = '';
let slug = '';
let attemptId = '';
let attemptToken = '';

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

async function seedTeacherSession() {
  const tokens = await api('POST', '/auth/login', { email: TEACHER_EMAIL, password: TEACHER_PASSWORD });
  teacherToken = tokens.access_token;
  window.localStorage.setItem(ACCESS_KEY, tokens.access_token);
  window.localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
  const me = await api('GET', '/auth/me', undefined, tokens.access_token);
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(me.teacher));
}

beforeAll(async () => {
  const login = await api('POST', '/auth/login', { email: TEACHER_EMAIL, password: TEACHER_PASSWORD });
  teacherToken = login.access_token;

  const created = await api('POST', '/exams', {
    title: `Ordering Multi Test ${RUN}`,
    duration_minutes: 30,
    ranking_enabled: true,
    result_visibility: true,
    review_visibility: true,
  }, teacherToken);
  examId = created.id;
  slug = created.slug;

  // Add question with 4 tokens and 2 valid orders
  await api('POST', `/exams/${examId}/questions`, {
    type: 'ordering',
    text: 'Arrange into a valid sentence.',
    marks: 2,
    data: {
      type: 'ordering',
      tokens: [
        { id: 'w1', text: 'I' },
        { id: 'w2', text: 'went' },
        { id: 'w3', text: 'to' },
        { id: 'w4', text: 'school' },
      ],
      valid_orders: [
        ['w1', 'w2', 'w3', 'w4'], // I went to school
        ['w4', 'w3', 'w2', 'w1'], // school to went I
      ],
      first_word: 'I',
      first_word_id: 'w1',
    },
  }, teacherToken);

  await api('POST', `/exams/${examId}/publish`, undefined, teacherToken);

  const start = await api('POST', `/exams/${slug}/start`, { student_name: `Multi Student ${RUN}` });
  attemptId = start.attempt_id;
  attemptToken = start.student_token;
});

beforeEach(() => {
  __resetAuthStoreForTests();
});

describe('Ordering Enhancements Flow', () => {
  it('teacher editor correctly loads multiple valid orders and first word', async () => {
    await seedTeacherSession();
    window.history.pushState({}, '', `/exams/${examId}`);
    render(<App />);

    await screen.findByText('Valid Correct Orders (2)', undefined, { timeout: 10000 });
    expect(screen.getByText('Valid Order #1')).toBeTruthy();
    expect(screen.getByText('Valid Order #2')).toBeTruthy();

    const select = screen.getByLabelText('Select first word') as HTMLSelectElement;
    expect(select.value).toBe('w1');
  });

  it('teacher can add a valid order, reorder words in it, and delete it', async () => {
    const user = userEvent.setup();
    await seedTeacherSession();
    window.history.pushState({}, '', `/exams/${examId}`);
    render(<App />);

    await screen.findByText('Valid Correct Orders (2)');

    // Add another correct order
    const addBtn = screen.getByRole('button', { name: /\+ Add another correct order/i });
    await user.click(addBtn);

    await screen.findByText('Valid Correct Orders (3)');
    expect(screen.getByText('Valid Order #3')).toBeTruthy();

    // Reorder words in Valid Order #3 using right arrow on the first word
    const moveRightBtn = screen.getByRole('button', { name: /Move I right in order 3/i });
    await user.click(moveRightBtn);

    // Delete Valid Order #3
    const deleteBtn = screen.getByRole('button', { name: /Delete valid order 3/i });
    await user.click(deleteBtn);

    await screen.findByText('Valid Correct Orders (2)');
    expect(screen.queryByText('Valid Order #3')).toBeNull();
  });

  it('preview displays first word visual indicator and remains sanitized', async () => {
    await seedTeacherSession();
    window.history.pushState({}, '', `/exams/${examId}/preview`);
    render(<App />);

    await screen.findByText(/teacher preview/i, undefined, { timeout: 10000 });
    expect(screen.getByText(/first word:/i)).toBeTruthy();
    expect(screen.getByText('First')).toBeTruthy();

    // Ensure valid orders / answers are not exposed in preview DOM
    expect(screen.queryByText('Valid Order #1')).toBeNull();
  });

  it('student UI displays first word visual indicator and accepts valid order #2', async () => {
    const user = userEvent.setup();
    setAttemptToken(attemptId, attemptToken);
    window.history.pushState({}, '', `/attempt/${attemptId}`);
    render(<App />);

    await screen.findByText('Available words', undefined, { timeout: 10000 });
    expect(screen.getByText(/first word:/i)).toBeTruthy();

    // Tap valid order #2: school -> to -> went -> I
    const availableBox = screen.getByText('Available words').parentElement as HTMLElement;
    for (const word of ['school', 'to', 'went', 'I']) {
      const btn = within(availableBox).getByRole('button', { name: new RegExp(`^${word}`, 'i') });
      await user.click(btn);
    }

    await user.click(screen.getByRole('button', { name: /submit answer/i }));
    await screen.findByText(/^correct$/i, undefined, { timeout: 10000 });
  });

  it('incorrect submission reveals multiple accepted orders in feedback', async () => {
    // Create another attempt on a fresh exam to test incorrect feedback
    const user = userEvent.setup();
    const testExam = await api('POST', '/exams', {
      title: `Feedback Multiple Orders ${RUN}`,
      duration_minutes: 30,
    }, teacherToken);

    await api('POST', `/exams/${testExam.id}/questions`, {
      type: 'ordering',
      text: 'Order the words.',
      marks: 1,
      data: {
        type: 'ordering',
        tokens: [
          { id: 't1', text: 'I' },
          { id: 't2', text: 'went' },
          { id: 't3', text: 'home' },
        ],
        valid_orders: [
          ['t1', 't2', 't3'], // I went home
          ['t3', 't1', 't2'], // home I went
        ],
      },
    }, teacherToken);

    await api('POST', `/exams/${testExam.id}/publish`, undefined, teacherToken);

    const start = await api('POST', `/exams/${testExam.slug}/start`, { student_name: `Student Wrong ${RUN}` });
    const wrongAid = start.attempt_id;
    const wrongToken = start.student_token;

    setAttemptToken(wrongAid, wrongToken);
    window.history.pushState({}, '', `/attempt/${wrongAid}`);
    render(<App />);

    await screen.findByText('Available words', undefined, { timeout: 10000 });

    // Submit wrong sequence: went -> I -> home
    const availableBox = screen.getByText('Available words').parentElement as HTMLElement;
    for (const word of ['went', 'I', 'home']) {
      const btn = within(availableBox).getByRole('button', { name: new RegExp(`^${word}`, 'i') });
      await user.click(btn);
    }

    await user.click(screen.getByRole('button', { name: /submit answer/i }));
    await screen.findByText(/^incorrect$/i, undefined, { timeout: 10000 });

    // Should show "Accepted answers" with both valid orders
    const acceptedHeader = await screen.findByText('Accepted answers');
    const feedbackBox = acceptedHeader.closest('div')!;
    expect(within(feedbackBox).getByText('1')).toBeTruthy();
    expect(within(feedbackBox).getByText('2')).toBeTruthy();
  });
});
