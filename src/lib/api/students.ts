import { request } from './client';

export interface StudentListItem {
  id: string;
  name: string;
  created_at: string;
  exam_count: number;
  attempts_count: number;
  average_score: number;
  average_percentage: number;
  highest_score: number;
  highest_percentage: number;
  last_exam_at: string | null;
  last_exam_title: string | null;
}

export const studentsApi = {
  list: (q?: string) =>
    request<StudentListItem[]>(`/students${q ? `?q=${encodeURIComponent(q)}` : ''}`),
};
