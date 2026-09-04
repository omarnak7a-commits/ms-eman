import { request } from './client';

export interface ResultAttemptRow {
  attempt_id: string;
  student_id: string;
  student_name: string;
  status: 'active' | 'submitted' | 'expired';
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
}

export interface ExamResultsResponse {
  exam_id: string;
  exam_title: string;
  summary: {
    total_attempts: number;
    completed_attempts: number;
    average_score: number;
    average_percentage: number;
    highest_score: number;
    lowest_score: number;
    highest_percentage: number;
    lowest_percentage: number;
  };
  attempts: ResultAttemptRow[];
}

export interface ReviewAnswerItem {
  question_id: string;
  question_type: string;
  text: string;
  order_index: number;
  marks: number;
  student_answer: Record<string, unknown> | null;
  correct_answer: Record<string, unknown> | null;
  is_correct: boolean | null;
  awarded_marks: number;
}

export interface AttemptDetailResponse {
  attempt_id: string;
  student_id: string;
  student_name: string;
  status: string;
  started_at: string;
  deadline_at: string;
  submitted_at: string | null;
  score: number;
  max_score: number;
  percentage: number;
  correct_count: number;
  incorrect_count: number;
  unanswered_count: number;
  time_used_seconds: number;
  rank: number | null;
  answers: ReviewAnswerItem[];
}

export interface RankingEntry {
  rank: number;
  student_name: string;
  score: number;
  max_score: number;
  percentage: number;
  time_used_seconds: number;
  attempt_id: string;
  submitted_at: string | null;
}

export interface RankingResponse {
  exam_id: string;
  exam_title: string;
  ranking_enabled: boolean;
  entries: RankingEntry[];
}

export const resultsApi = {
  examResults: (examId: string) =>
    request<ExamResultsResponse>(`/exams/${examId}/results`),
  attemptDetail: (examId: string, attemptId: string) =>
    request<AttemptDetailResponse>(`/exams/${examId}/results/${attemptId}`),
  teacherRanking: (examId: string) =>
    request<RankingResponse>(`/exams/${examId}/ranking`),
};
