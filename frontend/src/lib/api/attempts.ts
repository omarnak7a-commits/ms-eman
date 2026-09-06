import type { AnswerData, CorrectAnswerPayload } from '@/types';
import { request } from './client';
import { storageGet, storageSet } from '@/lib/storage';

// ── Student attempt token store ─────────────────────────────────────────────
// The attempt token authorizes all calls for a given attempt (resume, autosave,
// submit, result, review, ranking). It is stored so a browser refresh or a
// reopen while the deadline has not passed can continue.
function tokenKey(attemptId: string): string {
  return `ty_attempt_${attemptId}`;
}
export function getAttemptToken(attemptId: string): string | null {
  return storageGet(tokenKey(attemptId));
}
export function setAttemptToken(attemptId: string, token: string): void {
  storageSet(tokenKey(attemptId), token);
}

export interface StudentOption {
  id: string;
  text: string;
  order_index: number;
}
export interface StudentToken {
  id: string;
  text: string;
}
export interface StudentQuestion {
  id: string;
  type: 'multiple_choice' | 'ordering' | 'correct_brackets';
  text: string;
  marks: number;
  data: {
    type: string;
    options?: StudentOption[];
    tokens?: StudentToken[];
    sentence?: string;
    brackets?: Array<{ id: string; original_word: string }>;
  };
}

export interface ExamPublicInfo {
  id: string;
  slug: string;
  title: string;
  description: string;
  instructions: string;
  duration_minutes: number;
  status: string;
  ranking_enabled: boolean;
  result_visibility: boolean;
  review_visibility: boolean;
  question_count: number;
  max_score: number;
}

export interface StartedAttempt {
  attempt_id: string;
  exam_id: string;
  exam_slug: string;
  status: string;
  started_at: string;
  /** Canonical ISO-8601 UTC ("Z") — safe to parse on every mobile engine. */
  deadline_at: string;
  /** Server-authoritative remaining seconds at response time. */
  remaining_seconds?: number;
  duration_seconds: number;
  student_token: string;
  questions: StudentQuestion[];
}

export interface SavedAnswer {
  id: string;
  attempt_id: string;
  question_id: string;
  answer_data: AnswerData;
  is_correct: boolean | null;
  /**
   * Server-provided correct answer — part of the grading result, present only
   * when the submitted answer was incorrect. Never sent before submission.
   */
  correct_answer?: CorrectAnswerPayload | null;
  answered_at: string;
  updated_at: string;
}

export interface SubmittedAttempt {
  id: string;
  exam_id: string;
  exam_title: string;
  exam_slug: string;
  ranking_enabled: boolean;
  result_visibility: boolean;
  review_visibility: boolean;
  student_name: string;
  status: string;
  started_at: string;
  submitted_at: string | null;
  score: number;
  max_score: number;
  percentage: number;
  correct_count: number;
  incorrect_count: number;
  unanswered_count: number;
  time_used_seconds: number;
  rank: number | null;
  ranking_total: number | null;
}

export interface AttemptStatusData {
  id: string;
  exam_id: string;
  status: string;
  started_at: string;
  /** Canonical ISO-8601 UTC ("Z") — safe to parse on every mobile engine. */
  deadline_at: string;
  /** Server-authoritative remaining seconds at response time. */
  remaining_seconds?: number;
  submitted_at: string | null;
  can_resume: boolean;
  student_name: string | null;
  exam_title: string | null;
}

export const attemptsApi = {
  examInfo: (slug: string) =>
    request<ExamPublicInfo>(`/exams/${slug}/info`),
  start: (slug: string, student_name: string) =>
    request<StartedAttempt>(`/exams/${slug}/start`, {
      method: 'POST',
      body: { student_name },
      auth: null,
    }),
  status: (attemptId: string, token: string) =>
    request<AttemptStatusData>(`/attempts/${attemptId}`, {
      auth: 'student',
      token,
    }),
  resume: (attemptId: string, token: string) =>
    request<{
      status: AttemptStatusData;
      can_resume: boolean;
      questions?: StudentQuestion[];
      answers?: Array<{
        question_id: string;
        answer_data: AnswerData;
        is_correct: boolean | null;
        /** Same post-grading feedback shown at submit time (incorrect only). */
        correct_answer?: CorrectAnswerPayload | null;
      }>;
    }>(`/attempts/${attemptId}/resume`, { auth: 'student', token }),
  saveAnswer: (attemptId: string, questionId: string, token: string, answer_data: AnswerData) =>
    request<SavedAnswer>(`/attempts/${attemptId}/answers/${questionId}`, {
      method: 'PUT',
      body: { answer_data },
      auth: 'student',
      token,
    }),
  submit: (attemptId: string, token: string) =>
    request<{ attempt_id: string; status: string }>(`/attempts/${attemptId}/submit`, {
      method: 'POST',
      auth: 'student',
      token,
    }),
  result: (attemptId: string, token: string) =>
    request<{ attempt: SubmittedAttempt }>(`/attempts/${attemptId}/result`, {
      auth: 'student',
      token,
    }),
  review: (attemptId: string, token: string) =>
    request<{
      attempt_id: string;
      exam_id: string;
      exam_title: string;
      ranking_enabled: boolean;
      result_visibility: boolean;
      student_name: string;
      score: number;
      max_score: number;
      percentage: number;
      submitted_at: string | null;
      items: Array<{
        question_id: string;
        question_type: string;
        text: string;
        marks: number;
        student_answer: AnswerData | null;
        correct_answer: Record<string, unknown> | null;
        is_correct: boolean | null;
        awarded_marks: number;
      }>;
    }>(`/attempts/${attemptId}/review`, { auth: 'student', token }),
  ranking: (attemptId: string, token: string) =>
    request<{
      exam_id: string;
      exam_title: string;
      ranking_enabled: boolean;
      entries: Array<{
        rank: number;
        student_name: string;
        score: number;
        max_score: number;
        percentage: number;
        time_used_seconds: number;
        attempt_id: string;
        submitted_at: string | null;
      }>;
    }>(`/attempts/${attemptId}/ranking`, { auth: 'student', token }),
};
