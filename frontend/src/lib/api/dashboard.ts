import { request } from './client';
import type { ExamApiOut } from './exams';

export interface ExamRow extends ExamApiOut {
  completed_count: number;
  average_percentage: number;
}

export interface DashboardSummary {
  total_exams: number;
  total_students: number;
  total_attempts: number;
  completed_attempts: number;
  average_score: number;
  recent_exams: ExamRow[];
}

export const dashboardApi = {
  summary: () => request<DashboardSummary>('/dashboard'),
};
