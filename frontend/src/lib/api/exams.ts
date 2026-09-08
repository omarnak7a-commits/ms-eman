import type { Exam, Question, QuestionType } from '@/types';
import { request } from './client';

export type ExamStatus = Exam['status'];

export interface ExamApiOut extends Exam {
  question_count: number;
  attempt_count: number;
}

export interface QuestionPayload {
  type: QuestionType;
  text: string;
  marks: number;
  order_index?: number;
  data: Record<string, unknown>;
}

export const examsApi = {
  list: () => request<ExamApiOut[]>('/exams'),
  get: (id: string) => request<ExamApiOut>(`/exams/${id}`),
  create: (data: Partial<Exam>) =>
    request<ExamApiOut>('/exams', { method: 'POST', body: data }),
  update: (id: string, data: Partial<Exam>) =>
    request<ExamApiOut>(`/exams/${id}`, { method: 'PUT', body: data }),
  remove: (id: string) => request<void>(`/exams/${id}`, { method: 'DELETE' }),
  publish: (id: string) =>
    request<ExamApiOut>(`/exams/${id}/publish`, { method: 'POST' }),
  activate: (id: string) =>
    request<ExamApiOut>(`/exams/${id}/activate`, { method: 'POST' }),
  close: (id: string) =>
    request<ExamApiOut>(`/exams/${id}/close`, { method: 'POST' }),
  duplicate: (id: string) =>
    request<ExamApiOut>(`/exams/${id}/duplicate`, { method: 'POST' }),
  questions: (id: string) => request<Question[]>(`/exams/${id}/questions`),
  addQuestion: (id: string, q: QuestionPayload) =>
    request<Question>(`/exams/${id}/questions`, { method: 'POST', body: q }),
  updateQuestion: (qid: string, q: Partial<Question>) =>
    request<Question>(`/questions/${qid}`, { method: 'PUT', body: q }),
  deleteQuestion: (qid: string) =>
    request<void>(`/questions/${qid}`, { method: 'DELETE' }),
  reorderQuestions: (id: string, ordered_ids: string[]) =>
    request<{ message: string }>(`/exams/${id}/questions/reorder`, {
      method: 'PUT',
      body: { ordered_ids },
    }),
  preview: (id: string) =>
    request<{
      exam_id: string;
      title: string;
      description: string;
      instructions: string;
      duration_minutes: number;
      status: string;
      max_score: number;
      // Sanitized student-view questions (no correct answers). Read-only:
      // fetching a preview never creates a student attempt.
      questions: Array<{
        id: string;
        type: QuestionType;
        text: string;
        marks: number;
        data: {
          type: string;
          options?: Array<{ id: string; text: string; order_index: number }>;
          tokens?: Array<{ id: string; text: string }>;
          first_word?: string;
          first_word_id?: string;
          sentence?: string;
          brackets?: Array<{ id: string; original_word: string }>;
        };
      }>;
    }>(`/exams/${id}/preview`),
};
