/**
 * End-to-end FEEDBACK tests — the real React UI driven by real DOM events
 * against the live FastAPI backend (bridged fetch, see setup.ts).
 *
 * Covers the unified post-grading feedback model for every question type:
 *
 *   Submit Answer → backend grading → ✓ Correct / ✕ Incorrect
 *                     and, when incorrect, the correct answer immediately —
 *                     taken from the server's grading result, never computed
 *                     in the frontend and never visible before submission.
 *
 * Plus the redesigned Correct-the-Brackets layout: plain sentence with the
 * bracketed words visible, one labeled input per bracket below the sentence.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { setAttemptToken } from '@/lib/api/attempts';

const BACKEND = 'http://127.0.0.1:8000';
const RUN = Date.now();
const TEACHER_EMAIL = 'ms.eman.zahy@test.com';
const TEACHER_PASSWORD = 'EmanDev2024!';

interface StudentQ {
  id: string;
  type: string;
  text: string;
  data: { options?: Array<{ id: string; text: string }>; tokens?: Array<{ id: string; text: string }> };
}

let slug = '';
let examId = '';
let attemptId = '';
let attemptToken = '';
let questions: StudentQ[] = [];

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
  const login = await api('POST', '/auth/login', {
    email: TEACHER_EMAIL,
    password: TEACHER_PASSWORD,
  });
  const tt = login.access_token;

  const exam = await api('POST', '/exams', {
    title: `Feedback E2E ${RUN}`,
    duration_minutes: 30,
    ranking_enabled: true,
    result_visibility: true,
    review_visibility: true,
  }, tt);
  examId = exam.id;
  slug = exam.slug;

  // Q1 MCQ (answered WRONG), Q2 ordering (WRONG), Q3 single bracket (WRONG),
  // Q4 multi bracket (WRONG), Q5 MCQ (CORRECT).
  await api('POST', `/exams/${examId}/questions`, {
    type: 'multiple_choice', text: 'What is the capital of Egypt?', marks: 1,
    data: { type: 'multiple_choice', options: [
      { text: 'London' }, { text: 'Cairo', is_correct: true }, { text: 'Paris' },
    ]},
  }, tt);
  await api('POST', `/exams/${examId}/questions`, {
    type: 'ordering', text: 'Arrange the following words.', marks: 1,
    data: { type: 'ordering', tokens: [
      { text: 'first' }, { text: 'second' }, { text: 'third' },
    ]},
  }, tt);
  await api('POST', `/exams/${examId}/questions`, {
    type: 'correct_brackets', text: 'Choose the correct answer from the brackets.', marks: 1,
    data: { type: 'correct_brackets', sentence: 'She (go) to school every day.',
      brackets: [{ original_word: 'go', accepted_answers: ['goes'], case_sensitive: false }] },
  }, tt);
  await api('POST', `/exams/${examId}/questions`, {
    type: 'correct_brackets', text: 'Fix both bracketed words.', marks: 2,
    data: { type: 'correct_brackets', sentence: 'She (go) to the (school) every day.',
      brackets: [
        { original_word: 'go', accepted_answers: ['goes'], case_sensitive: false },
        { original_word: 'school', accepted_answers: ['school', 'schools'], case_sensitive: false },
      ] },
  }, tt);
  await api('POST', `/exams/${examId}/questions`, {
    type: 'multiple_choice', text: '2 + 3 = ?', marks: 1,
    data: { type: 'multiple_choice', options: [
      { text: 'four' }, { text: 'five', is_correct: true }, { text: 'six' },
    ]},
  }, tt);
  await api('POST', `/exams/${examId}/publish`, undefined, tt);

  const start = await api('POST', `/exams/${slug}/start`, { student_name: `Feedback Student ${RUN}` });
  attemptId = start.attempt_id;
  attemptToken = start.student_token;
  questions = start.questions;
  expect(questions).toHaveLength(5);

  // SECURITY: the in-exam question payload carries no correct answers at all.
  const blob = JSON.stringify(start.questions);
  expect(blob).not.toContain('is_correct');
  expect(blob).not.toContain('correct_position');
  expect(blob).not.toContain('accepted_answers');
  expect(blob).not.toContain('correct_answer');
});

async function openAttempt() {
  setAttemptToken(attemptId, attemptToken);
  window.history.pushState({}, '', `/attempt/${attemptId}`);
  render(<App />);
  await screen.findByText('What is the capital of Egypt?', undefined, { timeout: 10000 });
}

const byText = (text: string) => questions.find(q => q.text === text)!;

describe('Unified grading feedback (real UI + real backend)', () => {
  it('shows no correct-answer information before any submission', async () => {
    await openAttempt();
    // No feedback panel, no "Correct answer" label anywhere on Q1.
    expect(screen.queryByText(/correct answer/i)).toBeNull();
    expect(screen.queryByText(/^incorrect$/i)).toBeNull();
    expect(screen.queryByText(/^correct$/i)).toBeNull();
  });

  it('MCQ incorrect → ✕ Incorrect + the correct option appears immediately', async () => {
    const user = userEvent.setup();
    await openAttempt();
    await user.click(screen.getByText('London')); // wrong option
    await user.click(screen.getByRole('button', { name: /submit answer/i }));

    await screen.findByText(/^incorrect$/i, undefined, { timeout: 10000 });
    // The server's correct answer is revealed right away.
    const label = await screen.findByText('Correct answer');
    const card = label.parentElement as HTMLElement;
    expect(within(card).getByText('Cairo')).toBeTruthy();
    // Locked: no Submit Answer button remains.
    expect(screen.queryByRole('button', { name: /submit answer/i })).toBeNull();
  });

  it('ordering incorrect → ✕ Incorrect + the full correct order', async () => {
    const user = userEvent.setup();
    await openAttempt();
    await user.click(screen.getByRole('button', { name: /^Question 2/ }));
    await screen.findByText('Available words');

    // Wrong arrangement: third → first → second.
    for (const word of ['third', 'first', 'second']) {
      const box = screen.getByText('Available words').parentElement as HTMLElement;
      await user.click(within(box).getByText(word).closest('button')!);
    }
    await user.click(screen.getByRole('button', { name: /submit answer/i }));

    await screen.findByText(/^incorrect$/i, undefined, { timeout: 10000 });
    const label = await screen.findByText('Correct order');
    const chips = within(label.parentElement as HTMLElement).getAllByText(/first|second|third/);
    expect(chips.map(c => c.textContent)).toEqual(['first', 'second', 'third']);
  });

  it('single bracket: plain sentence + ONE input below; wrong → correct answer shown', async () => {
    const user = userEvent.setup();
    await openAttempt();
    await user.click(screen.getByRole('button', { name: /^Question 3/ }));

    // The sentence reads as plain text with the bracketed word visible…
    const sentence = await screen.findByTestId('brackets-sentence');
    expect(sentence.textContent).toBe('She (go) to school every day.');
    expect(sentence.querySelector('input')).toBeNull(); // …no input inside it
    // …and the correct answer exists NOWHERE on the page before submission.
    expect(screen.queryByText('goes')).toBeNull();

    // Exactly one input, clearly below the sentence.
    const inputs = screen.getAllByPlaceholderText(/correction/i);
    expect(inputs).toHaveLength(1);
    expect(screen.getByText(/^your answer$/i)).toBeTruthy();

    await user.type(inputs[0], 'go'); // wrong
    await user.click(screen.getByRole('button', { name: /submit answer/i }));
    await screen.findByText(/^incorrect$/i, undefined, { timeout: 10000 });
    const label = await screen.findByText('Correct answer');
    expect(within(label.parentElement as HTMLElement).getByText('goes')).toBeTruthy();
    expect((inputs[0] as HTMLInputElement).disabled).toBe(true);
  });

  it('multi bracket: one labeled input per bracket in order; wrong → numbered answers', async () => {
    const user = userEvent.setup();
    await openAttempt();
    await user.click(screen.getByRole('button', { name: /^Question 4/ }));
    const sentence = await screen.findByTestId('brackets-sentence');
    expect(sentence.textContent).toBe('She (go) to the (school) every day.');

    // Two inputs, each labeled with its bracketed word, in sentence order.
    const inputs = screen.getAllByPlaceholderText(/correction/i);
    expect(inputs).toHaveLength(2);
    expect(screen.getByLabelText('Correction for (go)')).toBeTruthy();
    expect(screen.getByLabelText('Correction for (school)')).toBeTruthy();
    expect(screen.getByText(/^your answers$/i)).toBeTruthy();

    await user.type(inputs[0], 'go');       // wrong
    await user.type(inputs[1], 'school');   // right, but first is wrong
    await user.click(screen.getByRole('button', { name: /submit answer/i }));

    await screen.findByText(/^incorrect$/i, undefined, { timeout: 10000 });
    const label = await screen.findByText('Correct answers');
    const items = within(label.parentElement as HTMLElement).getAllByRole('listitem');
    const texts = items.map(li => (li.textContent || '').replace(/\s+/g, ' ').trim());
    expect(texts[0]).toContain('goes');      // bracket 1, in order
    expect(texts[1]).toContain('school');    // bracket 2, in order
  });

  it('MCQ correct → ✓ Correct with no correct-answer reveal', async () => {
    const user = userEvent.setup();
    await openAttempt();
    await user.click(screen.getByRole('button', { name: /^Question 5/ }));
    await screen.findByText('2 + 3 = ?');

    await user.click(screen.getByText('five'));
    await user.click(screen.getByRole('button', { name: /submit answer/i }));
    await screen.findByText(/^correct$/i, undefined, { timeout: 10000 });
    await screen.findByText(/submitted and locked/i);
    // Correct submissions reveal nothing extra.
    expect(screen.queryByText('Correct answer')).toBeNull();
  });

  it('refresh keeps the verdict AND the revealed correct answer', async () => {
    await openAttempt(); // fresh mount = resume from the backend
    await screen.findByText(/^incorrect$/i, undefined, { timeout: 10000 });
    const label = await screen.findByText('Correct answer');
    expect(within(label.parentElement as HTMLElement).getByText('Cairo')).toBeTruthy();
  });
});
