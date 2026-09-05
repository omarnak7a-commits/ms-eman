export type ExamStatus = 'draft' | 'published' | 'active' | 'closed';
export type AttemptStatus = 'active' | 'submitted' | 'expired';
export type QuestionType = 'multiple_choice' | 'ordering' | 'correct_brackets';

export interface Teacher {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: 'teacher';
  created_at: string;
}

export interface MCQOption {
  id: string;
  text: string;
  order_index: number;
  is_correct: boolean;
}

export interface OrderingToken {
  id: string;
  text: string;
  correct_position: number;
}

export interface BracketItem {
  id: string;
  original_word: string;
  accepted_answers: string[];
  case_sensitive: boolean;
}

export type QuestionData =
  | { type: 'multiple_choice'; options: MCQOption[] }
  | { type: 'ordering'; tokens: OrderingToken[] }
  | { type: 'correct_brackets'; sentence: string; brackets: BracketItem[] };

export interface Question {
  id: string;
  exam_id: string;
  type: QuestionType;
  text: string;
  order_index: number;
  marks: number;
  data: QuestionData;
  created_at: string;
  updated_at: string;
}

export interface Exam {
  id: string;
  title: string;
  description: string;
  instructions: string;
  slug: string;
  duration_minutes: number;
  status: ExamStatus;
  ranking_enabled: boolean;
  result_visibility: boolean;
  review_visibility: boolean;
  created_by: string;
  published_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Student {
  id: string;
  name: string;
  normalized_name: string;
  created_at: string;
}

export interface ExamAttempt {
  id: string;
  exam_id: string;
  student_id: string;
  status: AttemptStatus;
  started_at: string;
  deadline_at: string;
  submitted_at: string | null;
  score: number;
  max_score: number;
  percentage: number;
  time_used_seconds: number;
  rank: number | null;
}

export interface Answer {
  id: string;
  attempt_id: string;
  question_id: string;
  answer_data: AnswerData;
  is_correct: boolean | null;
  awarded_marks: number;
  answered_at: string;
  updated_at: string;
}

export type AnswerData =
  | { type: 'multiple_choice'; selected_option_id: string }
  | { type: 'ordering'; token_ids: string[] }
  // Single-bracket questions store one string; multi-bracket questions store
  // one string per bracket (the shapes the backend validates and grades).
  | { type: 'correct_brackets'; answer: string | string[] };
