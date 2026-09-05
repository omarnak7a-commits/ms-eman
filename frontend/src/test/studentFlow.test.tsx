/**
 * End-to-end STUDENT SOLVING FLOW test — the real React UI driven by real DOM
 * events against the live FastAPI backend (bridged fetch, see setup.ts).
 *
 * Covers: MCQ / Ordering / Correct-Brackets answer + Submit Answer +
 * Correct/Incorrect feedback + lock, draft navigation guards, blank-question
 * skipping, refresh restore of locked answers, final exam submission, and the
 * timer never instantly expiring on load.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { setAttemptToken } from '@/lib/api/attempts';

const BACKEND = 'http://127.0.0.1:8000';
const RUN = Date.now();
const TEACHER_EMAIL = 'ms.eman.zahy@test.com';
const TEACHER_PASSWORD = 'EmanDev2024!';

interface TeacherQuestion {
  id: string;
  type: string;
  text: string;
  data: {
    options?: Array<{ id: string; text: string; is_correct: boolean }>;
    tokens?: Array<{ id: string; text: string }>;
  };
}

let slug = '';
let examId = '';
let attemptId = '';
let attemptToken = '';
let studentQuestions: TeacherQuestion[] = [];

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

beforeAll(async () => {
  // Teacher login (seeded dev teacher).
  const login = await api('POST', '/auth/login', {
    email: TEACHER_EMAIL,
    password: TEACHER_PASSWORD,
  });
  const tt = login.access_token;

  // Fresh exam per run: MCQ + ordering + brackets + a 2nd MCQ left blank.
  const exam = await api('POST', '/exams', {
    title: `Student Flow E2E ${RUN}`,
    description: '',
    instructions: '',
    duration_minutes: 30,
    ranking_enabled: true,
    result_visibility: true,
    review_visibility: true,
  }, tt);
  examId = exam.id;
  slug = exam.slug;

  await api('POST', `/exams/${examId}/questions`, {
    type: 'multiple_choice',
    text: 'She ___ to school every day.',
    marks: 1,
    data: {
      type: 'multiple_choice',
      options: [
        { text: 'goes', is_correct: true },
        { text: 'go' },
        { text: 'going' },
        { text: 'gone' },
      ],
    },
  }, tt);
  await api('POST', `/exams/${examId}/questions`, {
    type: 'ordering',
    text: 'Arrange the following words to make a correct sentence.',
    marks: 2,
    data: {
      type: 'ordering',
      tokens: [
        { text: 'Ahmed' },
        { text: 'plays' },
        { text: 'football' },
        { text: 'daily' },
      ],
    },
  }, tt);
  await api('POST', `/exams/${examId}/questions`, {
    type: 'correct_brackets',
    text: 'Choose the correct answer from the brackets.',
    marks: 1,
    data: {
      type: 'correct_brackets',
      sentence: 'She (go) to school every day.',
      brackets: [{ original_word: 'go', accepted_answers: ['goes'], case_sensitive: false }],
    },
  }, tt);
  await api('POST', `/exams/${examId}/questions`, {
    type: 'multiple_choice',
    text: '2 + 2 = ?',
    marks: 1,
    data: {
      type: 'multiple_choice',
      options: [
        { text: 'three' },
        { text: 'four', is_correct: true },
        { text: 'five' },
      ],
    },
  }, tt);
  await api('POST', `/exams/${examId}/publish`, undefined, tt);

  // Student starts the attempt (exactly like ExamStartPage does).
  const start = await api('POST', `/exams/${slug}/start`, { student_name: `Flow Student ${RUN}` });
  attemptId = start.attempt_id;
  attemptToken = start.student_token;
  studentQuestions = start.questions;
  expect(start.status).toBe('active');
  expect(studentQuestions).toHaveLength(4);
  // Correct answers must NEVER be exposed to the student.
  expect(JSON.stringify(start.questions)).not.toContain('is_correct');
  expect(JSON.stringify(start.questions)).not.toContain('correct_position');
  expect(JSON.stringify(start.questions)).not.toContain('accepted_answers');
});

function gotoAttempt() {
  window.history.pushState({}, '', `/attempt/${attemptId}`);
}

async function startAttemptPage() {
  setAttemptToken(attemptId, attemptToken);
  gotoAttempt();
  render(<App />);
  await screen.findByText('She ___ to school every day.', undefined, { timeout: 10000 });
}

const mcqQ = () => studentQuestions.find(q => q.type === 'multiple_choice')!;
const orderQ = () => studentQuestions.find(q => q.type === 'ordering')!;
const bracketsQ = () => studentQuestions.find(q => q.type === 'correct_brackets')!;
const blankQ = () => studentQuestions.find(q => q.text === '2 + 2 = ?')!;

describe('Student solving flow (real UI + real backend)', () => {
  it('loads the active attempt without instant auto-submit and shows a live timer', async () => {
    await startAttemptPage();
    // Still on the question page — nothing was auto-submitted on load.
    expect(window.location.pathname).toBe(`/attempt/${attemptId}`);
    // Timer renders as positive MM:SS (30 min exam).
    const timer = await screen.findByText(/^2\d:\d\d$/);
    expect(timer.textContent).toMatch(/^2\d:\d\d$/);
    // Submit Answer exists but is disabled while the draft is empty.
    const submitBtn = screen.getByRole('button', { name: /submit answer/i });
    expect((submitBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('MCQ: pick → change draft → Submit Answer → Incorrect feedback → locked', async () => {
    const user = userEvent.setup();
    await startAttemptPage();

    // Pick a WRONG option first (draft is changeable before submit).
    await user.click(screen.getByText('go'));
    expect((screen.getByRole('button', { name: /submit answer/i }) as HTMLButtonElement).disabled).toBe(false);
    // Change the draft before submitting.
    await user.click(screen.getByText('going'));

    // Submit Answer → server grades → Incorrect feedback + lock.
    await user.click(screen.getByRole('button', { name: /submit answer/i }));
    await screen.findByText(/^incorrect answer$/i, undefined, { timeout: 10000 });
    await screen.findByText(/submitted and locked/i);

    // The Submit Answer button is gone now; options are disabled.
    expect(screen.queryByRole('button', { name: /submit answer/i })).toBeNull();
    const optGoes = screen.getByText('goes').closest('button')!;
    expect((optGoes as HTMLButtonElement).disabled).toBe(true);
  });

  it('navigation guard: draft without submit blocks leaving; Clear releases it', async () => {
    const user = userEvent.setup();
    await startAttemptPage();
    // Q1 is locked; move to Q2 (ordering).
    await user.click(screen.getByRole('button', { name: /^next/i }));
    await screen.findByText('Available words');

    // Tap one token → creates a draft.
    const availableBox = screen.getByText('Available words').parentElement!;
    const firstToken = within(availableBox as HTMLElement).getAllByRole('button')[0];
    await user.click(firstToken);

    // Try to leave with an unsubmitted draft → blocked with clear feedback.
    await user.click(screen.getByRole('button', { name: /^next/i }));
    await screen.findByText(/unsubmitted answer/i);
    expect(window.location.pathname).toBe(`/attempt/${attemptId}`);
    // Still on Q2 (ordering surface still visible).
    expect(screen.getByText('Available words')).toBeTruthy();

    // Clear the draft → navigation is allowed again.
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await user.click(screen.getByRole('button', { name: /^next/i }));
    await screen.findByPlaceholderText(/correction/i);
  });

  it('ordering: arrange all tokens → Submit Answer → Correct → locked', async () => {
    const user = userEvent.setup();
    await startAttemptPage();
    await user.click(screen.getByRole('button', { name: /^Question 2/ })); // dot nav to Q2
    await screen.findByText('Available words');

    for (const word of ['Ahmed', 'plays', 'football', 'daily']) {
      const availableBox = screen.getByText('Available words').parentElement!;
      const btn = within(availableBox as HTMLElement).getByText(word).closest('button')!;
      await user.click(btn);
    }
    await user.click(screen.getByRole('button', { name: /submit answer/i }));
    await screen.findByText(/^correct answer$/i, undefined, { timeout: 10000 });
    await screen.findByText(/submitted and locked/i);

    // Tokens no longer interactive after lock.
    const placed = screen.getByText('Available words').parentElement!.querySelectorAll('button');
    expect(placed.length).toBe(0);
  });

  it('correct brackets: type answer → Submit Answer → Correct → locked', async () => {
    const user = userEvent.setup();
    await startAttemptPage();
    await user.click(screen.getByRole('button', { name: /^Question 3/ })); // dot nav to Q3
    const input = await screen.findByPlaceholderText(/correction/i);
    await user.type(input, 'goes');
    await user.click(screen.getByRole('button', { name: /submit answer/i }));
    await screen.findByText(/^correct answer$/i, undefined, { timeout: 10000 });
    await screen.findByText(/submitted and locked/i);
    expect((input as HTMLInputElement).disabled).toBe(true);
  });

  it('blank question: can be skipped freely and returned to later', async () => {
    const user = userEvent.setup();
    await startAttemptPage();
    await user.click(screen.getByRole('button', { name: /^Question 4/ })); // Q4 blank
    await screen.findByText('2 + 2 = ?');
    // Nothing answered → Previous works immediately (no guard).
    await user.click(screen.getByRole('button', { name: /previous/i }));
    await screen.findByText(/submitted and locked/i); // Q3 locked state restored
    // And forward again.
    await user.click(screen.getByRole('button', { name: /^next/i }));
    await screen.findByText('2 + 2 = ?');
  });

  it('refresh: submitted answers remain locked with their feedback; drafts do not auto-submit', async () => {
    const user = userEvent.setup();
    await startAttemptPage();

    // Q1 feedback visible immediately after resume (locked + Incorrect).
    await screen.findByText(/^incorrect answer$/i);
    await screen.findByText(/submitted and locked/i);

    // Q2 still locked + Correct.
    await user.click(screen.getByRole('button', { name: /^Question 2/ }));
    await screen.findByText(/^correct answer$/i);
    await screen.findByText(/submitted and locked/i);

    // Q3 still locked + Correct.
    await user.click(screen.getByRole('button', { name: /^Question 3/ }));
    await screen.findByText(/^correct answer$/i);

    // Q4 still blank, editable, nothing auto-submitted server-side.
    await user.click(screen.getByRole('button', { name: /^Question 4/ }));
    const opt = await screen.findByText('four');
    expect((opt.closest('button') as HTMLButtonElement).disabled).toBe(false);

    const status = await api('GET', `/attempts/${attemptId}`, undefined, attemptToken);
    expect(status.status).toBe('active'); // no phantom submission
  });

  it('Submit Exam finalises with unanswered question counted; result page renders', async () => {
    const user = userEvent.setup();
    await startAttemptPage();
    await user.click(screen.getByRole('button', { name: /^Question 4/ }));
    await screen.findByText('2 + 2 = ?');

    await user.click(screen.getByRole('button', { name: /submit exam/i }));
    // Confirm dialog.
    const dialog = await screen.findByText(/unsubmitted questions will be marked unanswered/i);
    expect(dialog).toBeTruthy();
    await user.click(within(document.body).getAllByRole('button', { name: 'Submit Exam' }).pop()!);

    // Result page: Q1 wrong (0), Q2 right (2), Q3 right (1), Q4 unanswered (0) → 3/5 = 60%.
    await waitFor(() => expect(window.location.pathname).toBe(`/attempt/${attemptId}/result`), { timeout: 10000 });
    await screen.findByText('60%', undefined, { timeout: 10000 });
    await screen.findByText('3 / 5');

    // Attempt is finalised server-side; further answers are rejected.
    const status = await api('GET', `/attempts/${attemptId}`, undefined, attemptToken);
    expect(status.status).toBe('submitted');
    await expect(
      api('PUT', `/attempts/${attemptId}/answers/${blankQ().id}`, {
        answer_data: { type: 'multiple_choice', selected_option_id: blankQ().data.options![1].id },
      }, attemptToken),
    ).rejects.toThrow(/409/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Second exam: MULTI-bracket question + regression checks for the fixes
// (multi-bracket used to be unanswerable: single input vs list validation).
// ─────────────────────────────────────────────────────────────────────────────

let mbSlug = '';
let mbExamId = '';
let mbAttemptId = '';
let mbToken = '';
let mbQuestions: TeacherQuestion[] = [];

describe('Multi-bracket + input guards (real UI + real backend)', () => {
  beforeAll(async () => {
    const login = await api('POST', '/auth/login', {
      email: TEACHER_EMAIL,
      password: TEACHER_PASSWORD,
    });
    const tt = login.access_token;
    const exam = await api('POST', '/exams', {
      title: `Multi Bracket E2E ${RUN}`,
      duration_minutes: 30,
      ranking_enabled: false,
      result_visibility: true,
      review_visibility: true,
    }, tt);
    mbExamId = exam.id;
    mbSlug = exam.slug;

    await api('POST', `/exams/${mbExamId}/questions`, {
      type: 'correct_brackets',
      text: 'Choose the correct answer from the brackets.',
      marks: 2,
      data: {
        type: 'correct_brackets',
        sentence: 'She (go) to (school) every day.',
        brackets: [
          { original_word: 'go', accepted_answers: ['goes'], case_sensitive: false },
          { original_word: 'school', accepted_answers: ['the school'], case_sensitive: false },
        ],
      },
    }, tt);
    await api('POST', `/exams/${mbExamId}/questions`, {
      type: 'ordering',
      text: 'Arrange the following words to make a correct sentence.',
      marks: 1,
      data: {
        type: 'ordering',
        tokens: [{ text: 'The' }, { text: 'sun' }, { text: 'rises' }],
      },
    }, tt);
    await api('POST', `/exams/${mbExamId}/questions`, {
      type: 'multiple_choice',
      text: 'Pick a colour.',
      marks: 1,
      data: {
        type: 'multiple_choice',
        options: [{ text: 'red', is_correct: true }, { text: 'blue' }],
      },
    }, tt);
    await api('POST', `/exams/${mbExamId}/publish`, undefined, tt);

    const start = await api('POST', `/exams/${mbSlug}/start`, { student_name: `Bracket Student ${RUN}` });
    mbAttemptId = start.attempt_id;
    mbToken = start.student_token;
    mbQuestions = start.questions;
  });

  async function startMbPage() {
    window.localStorage.setItem(`ty_attempt_${mbAttemptId}`, mbToken);
    window.history.pushState({}, '', `/attempt/${mbAttemptId}`);
    render(<App />);
    await screen.findByText(/every day/i, undefined, { timeout: 10000 });
  }

  it('multi-bracket renders one input per bracket and grades the full list', async () => {
    const user = userEvent.setup();
    await startMbPage();

    // Both brackets show inline inputs with the bracketed word labelled.
    const inputs = screen.getAllByPlaceholderText(/correction/i);
    expect(inputs).toHaveLength(2);

    await user.type(inputs[0], 'goes');
    await user.type(inputs[1], 'the school');
    await user.click(screen.getByRole('button', { name: /submit answer/i }));
    await screen.findByText(/^correct answer$/i, undefined, { timeout: 10000 });
    await screen.findByText(/submitted and locked/i);

    // Server stored the list-shaped answer and graded it correct.
    const resume = await api('GET', `/attempts/${mbAttemptId}/resume`, undefined, mbToken);
    const mbAnswer = resume.answers.find((a: { question_id: string }) =>
      a.question_id === mbQuestions.find(q => q.type === 'correct_brackets')!.id);
    expect(mbAnswer.is_correct).toBe(true);
    expect(mbAnswer.answer_data.answer).toEqual(['goes', 'the school']);
  });

  it('ordering cannot be submitted until every token is placed', async () => {
    const user = userEvent.setup();
    await startMbPage();
    await user.click(screen.getByRole('button', { name: /^Question 2/ }));
    await screen.findByText('Available words');

    // Place only 2 of 3 tokens → Submit stays disabled + hint is shown.
    const availableBox = screen.getByText('Available words').parentElement!;
    const btns = within(availableBox as HTMLElement).getAllByRole('button');
    await user.click(btns[0]);
    await user.click(within(screen.getByText('Available words').parentElement as HTMLElement).getAllByRole('button')[0]);
    const submitBtn = screen.getByRole('button', { name: /submit answer/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
    expect(screen.getByText(/place every word first/i)).toBeTruthy();

    // Place the last token → submit works.
    await user.click(within(screen.getByText('Available words').parentElement as HTMLElement).getAllByRole('button')[0]);
    expect((screen.getByRole('button', { name: /submit answer/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('MCQ draft can be deselected, releasing the navigation guard', async () => {
    const user = userEvent.setup();
    await startMbPage();
    await user.click(screen.getByRole('button', { name: /^Question 3/ }));
    await screen.findByText('Pick a colour.');

    await user.click(screen.getByText('blue'));
    // Guard: cannot leave with an unsubmitted draft.
    await user.click(screen.getByRole('button', { name: /^Question 1/ }));
    await screen.findByText(/unsubmitted answer/i);

    // Deselect (tap the selected option again) → draft cleared → nav free.
    await user.click(screen.getByText('blue'));
    await user.click(screen.getByRole('button', { name: /^Question 1/ }));
    await screen.findByText(/every day/i);
    expect(screen.queryByText(/unsubmitted answer/i)).toBeNull();
  });
});
