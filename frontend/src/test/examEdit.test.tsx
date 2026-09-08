/**
 * End-to-end EXAM EDIT + VERSIONING tests — the real React teacher UI driven
 * by real DOM events against the live FastAPI backend (bridged fetch).
 *
 * Scenario (the core requirement):
 *   v1 exam (2 questions) → Student A starts (pins v1)
 *   → teacher edits/adds/deletes questions via the editor UI
 *   → Student A STILL sees v1 (2 questions, same ids, own grading)
 *   → Student B (new) sees v2.
 * Plus: preview is sanitized + creates no attempt, answered questions are
 * soft-deleted (history survives), and editing published exams works.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { __resetAuthStoreForTests } from '@/hooks/useAuth';
import { setAttemptToken } from '@/lib/api/attempts';

const BACKEND = 'http://127.0.0.1:8000';
const RUN = Date.now();
const EMAIL = 'ms.eman.zahy@test.com';
const PASSWORD = 'EmanDev2024!';

let examId = '';
let slug = '';
let teacherToken = '';
let attemptA = '';
let tokenA = '';
let v1Ids: string[] = [];

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
  const tokens = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  teacherToken = tokens.access_token;
  window.localStorage.setItem('ty_api_access', tokens.access_token);
  window.localStorage.setItem('ty_api_refresh', tokens.refresh_token);
  const me = await api('GET', '/auth/me', undefined, tokens.access_token);
  window.localStorage.setItem('ty_teacher', JSON.stringify(me.teacher));
}

beforeAll(async () => {
  const login = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  teacherToken = login.access_token;

  const exam = await api('POST', '/exams', {
    title: `Edit Exam E2E ${RUN}`,
    duration_minutes: 30,
    ranking_enabled: true,
    result_visibility: true,
    review_visibility: true,
  }, teacherToken);
  examId = exam.id;
  slug = exam.slug;

  await api('POST', `/exams/${examId}/questions`, {
    type: 'multiple_choice', text: 'What is the capital of Egypt?', marks: 1,
    data: { type: 'multiple_choice', options: [
      { text: 'London' }, { text: 'Cairo', is_correct: true }, { text: 'Paris' },
    ]},
  }, teacherToken);
  await api('POST', `/exams/${examId}/questions`, {
    type: 'correct_brackets', text: 'Choose the correct answer from the brackets.', marks: 1,
    data: { type: 'correct_brackets', sentence: 'She (go) to school every day.',
      brackets: [{ original_word: 'go', accepted_answers: ['goes'], case_sensitive: false }] },
  }, teacherToken);
  await api('POST', `/exams/${examId}/publish`, undefined, teacherToken);

  // Student A starts BEFORE any edit → pins version 1.
  const start = await api('POST', `/exams/${slug}/start`, { student_name: `Editor A ${RUN}` });
  attemptA = start.attempt_id;
  tokenA = start.student_token;
  v1Ids = start.questions.map((q: { id: string }) => q.id);
  expect(v1Ids).toHaveLength(2);
});

beforeEach(() => {
  __resetAuthStoreForTests();
});

describe('Exam editor + versioning (real UI + real backend)', () => {
  it('published exam is editable and shows the versioning notice', async () => {
    await seedTeacherSession();
    window.history.pushState({}, '', `/exams/${examId}`);
    render(<App />);

    await screen.findByDisplayValue(`Edit Exam E2E ${RUN}`, undefined, { timeout: 10000 });
    // Attempt exists → versioning banner is shown.
    await screen.findByText(/versioning is active/i);
    // Fields are enabled for a PUBLISHED exam (not only drafts).
    expect((screen.getByDisplayValue(`Edit Exam E2E ${RUN}`) as HTMLInputElement).disabled).toBe(false);
    expect(screen.getByRole('button', { name: /save changes/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /preview exam/i })).toBeTruthy();
  });

  it('teacher edits title + adds a question via the editor; question ids stay stable', async () => {
    const user = userEvent.setup();
    await seedTeacherSession();
    window.history.pushState({}, '', `/exams/${examId}`);
    render(<App />);
    const titleInput = await screen.findByDisplayValue(`Edit Exam E2E ${RUN}`, undefined, { timeout: 10000 });

    // Edit the exam title.
    await user.clear(titleInput);
    await user.type(titleInput, `Edit Exam E2E ${RUN} REVISED`);

    // Add a brand-new MCQ via the existing creation flow. (Q1 is also an MCQ,
    // so target the LAST matching controls — the freshly appended card.)
    await user.click(screen.getByRole('button', { name: /\+ multiple choice/i }));
    const last = <T extends HTMLElement>(els: T[]) => els[els.length - 1];
    await user.type(last(screen.getAllByPlaceholderText('Enter question text...')), '2 + 3 = ?');
    await user.type(last(screen.getAllByPlaceholderText('Option A')), 'four');
    await user.type(last(screen.getAllByPlaceholderText('Option B')), 'five');
    await user.type(last(screen.getAllByPlaceholderText('Option C')), 'six');
    await user.type(last(screen.getAllByPlaceholderText('Option D')), 'seven');
    await user.click(last(screen.getAllByLabelText('Option B is correct')));

    await user.click(screen.getByRole('button', { name: /save changes/i }));
    // The save handler is fire-and-forget from the click, so wait on the
    // SERVER state (source of truth) until the full diff-sync has landed.
    await waitFor(async () => {
      const qs = await api('GET', `/exams/${examId}/questions`, undefined, teacherToken);
      expect(qs).toHaveLength(3);
    }, { timeout: 15000 });

    // Backend: title updated, 3 live questions, ORIGINAL ids preserved
    // (diff-based save — no delete-and-recreate).
    const exam = await api('GET', `/exams/${examId}`, undefined, teacherToken);
    expect(exam.title).toBe(`Edit Exam E2E ${RUN} REVISED`);
    const qs = await api('GET', `/exams/${examId}/questions`, undefined, teacherToken);
    expect(qs).toHaveLength(3);
    expect(qs[0].id).toBe(v1Ids[0]);
    expect(qs[1].id).toBe(v1Ids[1]);
    expect(qs[2].text).toBe('2 + 3 = ?');
  });

  it('Student A (in-progress) still sees exactly version 1 after the edits', async () => {
    // API level: resume returns the frozen 2 questions, original order/ids.
    const resume = await api('GET', `/attempts/${attemptA}/resume`, undefined, tokenA);
    expect(resume.questions.map((q: { id: string }) => q.id)).toEqual(v1Ids);

    // UI level: the solving page shows "Q1 / 2", not the edited 3-question set.
    setAttemptToken(attemptA, tokenA);
    window.history.pushState({}, '', `/attempt/${attemptA}`);
    render(<App />);
    await screen.findByText('What is the capital of Egypt?', undefined, { timeout: 10000 });
    await screen.findByText('Q1 / 2');
    expect(screen.queryByText('2 + 3 = ?')).toBeNull(); // v2 question never shown to A
  });

  it('a NEW student sees version 2 (3 questions)', async () => {
    const start = await api('POST', `/exams/${slug}/start`, { student_name: `Editor B ${RUN}` });
    expect(start.questions).toHaveLength(3);
    expect(start.questions.map((q: { text: string }) => q.text)).toContain('2 + 3 = ?');
  });

  it('preview renders the student view, is sanitized, and creates no attempt', async () => {
    await seedTeacherSession();
    window.history.pushState({}, '', `/exams/${examId}/preview`);
    render(<App />);

    await screen.findByText(/teacher preview/i, undefined, { timeout: 10000 });
    await screen.findByText('What is the capital of Egypt?');
    await screen.findByText('2 + 3 = ?');
    // The brackets sentence renders as styled spans — check its full text.
    const sentence = await screen.findByTestId('preview-brackets-sentence');
    expect(sentence.textContent).toBe('She (go) to school every day.');
    expect(sentence.querySelector('input')).toBeNull(); // inputs are below, not inline
    await screen.findByText('3 questions');
    // No grading information leaks into the preview DOM (the banner text is
    // the only place mentioning correct answers).
    await screen.findByText(/correct answers are never shown here/i);
    expect(screen.queryByText(/correct answer:/i)).toBeNull();
    // And no attempt was created by previewing (only A and B exist).
    const exam = await api('GET', `/exams/${examId}`, undefined, teacherToken);
    expect(exam.attempt_count).toBe(2);
  });

  it('deleting an answered question is soft: history survives, new students do not see it', async () => {
    // Student A answers the (v1) MCQ → it now has grading history.
    const resume = await api('GET', `/attempts/${attemptA}/resume`, undefined, tokenA);
    const mcq = resume.questions.find((q: { id: string }) => q.id === v1Ids[0]);
    const cairo = mcq.data.options.find((o: { text: string }) => o.text === 'Cairo');
    const answered = await api('PUT', `/attempts/${attemptA}/answers/${v1Ids[0]}`, {
      answer_data: { type: 'multiple_choice', selected_option_id: cairo.id },
    }, tokenA);
    expect(answered.is_correct).toBe(true);

    // Teacher deletes that question in the editor UI and saves.
    const user = userEvent.setup();
    await seedTeacherSession();
    window.history.pushState({}, '', `/exams/${examId}`);
    render(<App />);
    await screen.findByDisplayValue(`Edit Exam E2E ${RUN} REVISED`, undefined, { timeout: 10000 });

    const deleteButtons = screen.getAllByRole('button', { name: '✕' });
    await user.click(deleteButtons[0]); // Q1 (the answered MCQ)
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    // Wait for the server-side sync to complete (soft delete of Q1).
    await waitFor(async () => {
      const qs = await api('GET', `/exams/${examId}/questions`, undefined, teacherToken);
      expect(qs).toHaveLength(2);
    }, { timeout: 15000 });

    // New-student view: only 2 live questions, the answered MCQ is gone.
    const qs = await api('GET', `/exams/${examId}/questions`, undefined, teacherToken);
    expect(qs.map((q: { id: string }) => q.id)).not.toContain(v1Ids[0]);
    expect(qs).toHaveLength(2);

    // Student A: frozen version STILL has both v1 questions + the graded answer.
    const resumeA = await api('GET', `/attempts/${attemptA}/resume`, undefined, tokenA);
    expect(resumeA.questions.map((q: { id: string }) => q.id)).toEqual(v1Ids);
    const ans = resumeA.answers.find((a: { question_id: string }) => a.question_id === v1Ids[0]);
    expect(ans.is_correct).toBe(true);
  });

  it('L2: an exam in "active" state (via the activate API) can be closed from the UI', async () => {
    // Backend lifecycle: published → active → closed. The activate endpoint
    // has no dedicated UI, but an exam that IS active must still be closable
    // from the exam page instead of being stuck.
    const activated = await api('POST', `/exams/${examId}/activate`, undefined, teacherToken);
    expect(activated.status).toBe('active');

    await seedTeacherSession();
    window.history.pushState({}, '', `/exams/${examId}`);
    render(<App />);
    const user = userEvent.setup();
    // Close Exam button is visible for an ACTIVE exam (was published-only).
    const closeBtn = await screen.findByRole('button', { name: /close exam/i }, { timeout: 10000 });
    await user.click(closeBtn);

    const dialog = await screen.findByRole('dialog', { name: /close exam/i });
    await user.click(within(dialog).getByRole('button', { name: /close exam/i }));

    // Server confirms the exam is closed.
    await waitFor(async () => {
      const exam = await api('GET', `/exams/${examId}`, undefined, teacherToken);
      expect(exam.status).toBe('closed');
    }, { timeout: 10000 });
  });
});
