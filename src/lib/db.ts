import type {
  Teacher, Exam, Question, Student, ExamAttempt, Answer,
  MCQOption, OrderingToken, BracketItem
} from '@/types';
import { slugify } from './slugify';

// ─── Generic helpers ────────────────────────────────────────────────────────

function read<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]') as T[];
  } catch {
    return [];
  }
}

function write<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function now(): string {
  return new Date().toISOString();
}

// ─── Teachers ────────────────────────────────────────────────────────────────

const TEACHERS = 'ty_teachers';

export function getTeachers(): Teacher[] { return read<Teacher>(TEACHERS); }
export function getTeacherByEmail(email: string): Teacher | undefined {
  return getTeachers().find(t => t.email.toLowerCase() === email.toLowerCase());
}
export function getTeacherById(id: string): Teacher | undefined {
  return getTeachers().find(t => t.id === id);
}

// Simple "hash": prefix + base64-like encoding (not cryptographic, sufficient for demo)
export function hashPassword(pw: string): string {
  return 'hash:' + btoa(unescape(encodeURIComponent(pw)));
}
export function checkPassword(pw: string, hash: string): boolean {
  return hash === hashPassword(pw);
}

// ─── Exams ───────────────────────────────────────────────────────────────────

const EXAMS = 'ty_exams';

export function getExams(): Exam[] { return read<Exam>(EXAMS); }
export function getExamById(id: string): Exam | undefined {
  return getExams().find(e => e.id === id);
}
export function getExamBySlug(slug: string): Exam | undefined {
  return getExams().find(e => e.slug === slug);
}
export function getExamsByTeacher(teacherId: string): Exam[] {
  return getExams().filter(e => e.created_by === teacherId);
}

export function createExam(teacherId: string, data: Partial<Exam>): Exam {
  const exams = getExams();
  const exam: Exam = {
    id: uid(),
    title: data.title || '',
    description: data.description || '',
    instructions: data.instructions || '',
    slug: slugify(data.title || 'exam'),
    duration_minutes: data.duration_minutes || 30,
    status: 'draft',
    ranking_enabled: data.ranking_enabled ?? true,
    result_visibility: data.result_visibility ?? true,
    review_visibility: data.review_visibility ?? true,
    created_by: teacherId,
    published_at: null,
    closed_at: null,
    created_at: now(),
    updated_at: now(),
  };
  write(EXAMS, [...exams, exam]);
  return exam;
}

export function updateExam(id: string, data: Partial<Exam>): Exam | null {
  const exams = getExams();
  const idx = exams.findIndex(e => e.id === id);
  if (idx === -1) return null;
  const updated = { ...exams[idx], ...data, updated_at: now() };
  exams[idx] = updated;
  write(EXAMS, exams);
  return updated;
}

export function deleteExam(id: string): void {
  write(EXAMS, getExams().filter(e => e.id !== id));
  // cascade delete questions
  write(QUESTIONS, getQuestions().filter(q => q.exam_id !== id));
  // cascade delete attempts + answers
  const attempts = getAttempts().filter(a => a.exam_id === id);
  for (const a of attempts) {
    write(ANSWERS, getAnswers().filter(ans => ans.attempt_id !== a.id));
  }
  write(ATTEMPTS, getAttempts().filter(a => a.exam_id !== id));
}

export function publishExam(id: string): Exam | null {
  return updateExam(id, { status: 'published', published_at: now() });
}

export function closeExam(id: string): Exam | null {
  return updateExam(id, { status: 'closed', closed_at: now() });
}

export function duplicateExam(id: string, teacherId: string): Exam | null {
  const exam = getExamById(id);
  if (!exam) return null;
  const newExam = createExam(teacherId, {
    ...exam,
    title: exam.title + ' (Copy)',
    status: 'draft',
  });
  // duplicate questions
  const qs = getQuestionsByExam(id);
  for (const q of qs) {
    createQuestion(newExam.id, q);
  }
  return newExam;
}

// ─── Questions ───────────────────────────────────────────────────────────────

const QUESTIONS = 'ty_questions';

export function getQuestions(): Question[] { return read<Question>(QUESTIONS); }
export function getQuestionsByExam(examId: string): Question[] {
  return getQuestions()
    .filter(q => q.exam_id === examId)
    .sort((a, b) => a.order_index - b.order_index);
}
export function getQuestionById(id: string): Question | undefined {
  return getQuestions().find(q => q.id === id);
}

export function createQuestion(examId: string, data: Partial<Question>): Question {
  const qs = getQuestions();
  const examQs = qs.filter(q => q.exam_id === examId);
  const q: Question = {
    id: uid(),
    exam_id: examId,
    type: data.type || 'multiple_choice',
    text: data.text || '',
    order_index: data.order_index ?? examQs.length,
    marks: data.marks ?? 1,
    data: data.data || { type: 'multiple_choice', options: [] },
    created_at: now(),
    updated_at: now(),
  };
  write(QUESTIONS, [...qs, q]);
  return q;
}

export function updateQuestion(id: string, data: Partial<Question>): Question | null {
  const qs = getQuestions();
  const idx = qs.findIndex(q => q.id === id);
  if (idx === -1) return null;
  const updated = { ...qs[idx], ...data, updated_at: now() };
  qs[idx] = updated;
  write(QUESTIONS, qs);
  return updated;
}

export function deleteQuestion(id: string): void {
  const qs = getQuestions();
  const q = qs.find(x => x.id === id);
  if (!q) return;
  // re-index remaining questions in same exam
  const remaining = qs.filter(x => x.id !== id);
  const reindexed = remaining.map(x =>
    x.exam_id === q.exam_id && x.order_index > q.order_index
      ? { ...x, order_index: x.order_index - 1 }
      : x
  );
  write(QUESTIONS, reindexed);
}

export function reorderQuestions(examId: string, orderedIds: string[]): void {
  const qs = getQuestions();
  const updated = qs.map(q => {
    if (q.exam_id !== examId) return q;
    const idx = orderedIds.indexOf(q.id);
    return idx === -1 ? q : { ...q, order_index: idx };
  });
  write(QUESTIONS, updated);
}

// ─── Students ─────────────────────────────────────────────────────────────────

const STUDENTS = 'ty_students';

export function getStudents(): Student[] { return read<Student>(STUDENTS); }
export function getStudentById(id: string): Student | undefined {
  return getStudents().find(s => s.id === id);
}
export function findOrCreateStudent(name: string): Student {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, ' ');
  const students = getStudents();
  const existing = students.find(s => s.normalized_name === normalized);
  if (existing) return existing;
  const student: Student = {
    id: uid(),
    name: name.trim(),
    normalized_name: normalized,
    created_at: now(),
  };
  write(STUDENTS, [...students, student]);
  return student;
}

// ─── Attempts ────────────────────────────────────────────────────────────────

const ATTEMPTS = 'ty_attempts';

export function getAttempts(): ExamAttempt[] { return read<ExamAttempt>(ATTEMPTS); }
export function getAttemptById(id: string): ExamAttempt | undefined {
  return getAttempts().find(a => a.id === id);
}
export function getAttemptsByExam(examId: string): ExamAttempt[] {
  return getAttempts().filter(a => a.exam_id === examId);
}
export function getAttemptsByStudent(studentId: string): ExamAttempt[] {
  return getAttempts().filter(a => a.student_id === studentId);
}

export function createAttempt(examId: string, studentId: string): ExamAttempt {
  const exam = getExamById(examId);
  if (!exam) throw new Error('Exam not found');
  const started = new Date();
  const deadline = new Date(started.getTime() + exam.duration_minutes * 60 * 1000);
  const attempt: ExamAttempt = {
    id: uid(),
    exam_id: examId,
    student_id: studentId,
    status: 'active',
    started_at: started.toISOString(),
    deadline_at: deadline.toISOString(),
    submitted_at: null,
    score: 0,
    max_score: 0,
    percentage: 0,
    time_used_seconds: 0,
    rank: null,
  };
  write(ATTEMPTS, [...getAttempts(), attempt]);
  return attempt;
}

export function updateAttempt(id: string, data: Partial<ExamAttempt>): ExamAttempt | null {
  const attempts = getAttempts();
  const idx = attempts.findIndex(a => a.id === id);
  if (idx === -1) return null;
  const updated = { ...attempts[idx], ...data };
  attempts[idx] = updated;
  write(ATTEMPTS, attempts);
  return updated;
}

// ─── Answers ─────────────────────────────────────────────────────────────────

const ANSWERS = 'ty_answers';

export function getAnswers(): Answer[] { return read<Answer>(ANSWERS); }
export function getAnswersByAttempt(attemptId: string): Answer[] {
  return getAnswers().filter(a => a.attempt_id === attemptId);
}
export function getAnswerByAttemptQuestion(attemptId: string, questionId: string): Answer | undefined {
  return getAnswers().find(a => a.attempt_id === attemptId && a.question_id === questionId);
}

export function saveAnswer(
  attemptId: string,
  questionId: string,
  answerData: Answer['answer_data']
): Answer {
  const answers = getAnswers();
  const existing = answers.find(a => a.attempt_id === attemptId && a.question_id === questionId);
  const t = now();
  if (existing) {
    const idx = answers.indexOf(existing);
    answers[idx] = { ...existing, answer_data: answerData, updated_at: t };
    write(ANSWERS, answers);
    return answers[idx];
  }
  const answer: Answer = {
    id: uid(),
    attempt_id: attemptId,
    question_id: questionId,
    answer_data: answerData,
    is_correct: null,
    awarded_marks: 0,
    answered_at: t,
    updated_at: t,
  };
  write(ANSWERS, [...answers, answer]);
  return answer;
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

export function seedIfEmpty(): void {
  if (getTeachers().length > 0) return;

  const teacher: Teacher = {
    id: 'teacher-1',
    name: 'Ms Eman Zahy',
    email: 'ms.eman.zahy@test.com',
    password_hash: hashPassword('password123'),
    role: 'teacher',
    created_at: now(),
  };
  write(TEACHERS, [teacher]);

  const exam: Exam = {
    id: 'exam-seed-1',
    title: 'English Grammar Test',
    description: 'A sample English grammar examination.',
    instructions: 'Read each question carefully and choose the best answer. You have 30 minutes to complete all questions.',
    slug: 'english-grammar-test-SEED1',
    duration_minutes: 30,
    status: 'published',
    ranking_enabled: true,
    result_visibility: true,
    review_visibility: true,
    created_by: 'teacher-1',
    published_at: now(),
    closed_at: null,
    created_at: now(),
    updated_at: now(),
  };
  write(EXAMS, [exam]);

  const optA: MCQOption = { id: 'opt-a', text: 'goes', order_index: 0, is_correct: true };
  const optB: MCQOption = { id: 'opt-b', text: 'go', order_index: 1, is_correct: false };
  const optC: MCQOption = { id: 'opt-c', text: 'going', order_index: 2, is_correct: false };
  const optD: MCQOption = { id: 'opt-d', text: 'gone', order_index: 3, is_correct: false };

  const tokens: OrderingToken[] = [
    { id: 'tok-1', text: 'Ahmed', correct_position: 0 },
    { id: 'tok-2', text: 'goes', correct_position: 1 },
    { id: 'tok-3', text: 'to', correct_position: 2 },
    { id: 'tok-4', text: 'school', correct_position: 3 },
    { id: 'tok-5', text: 'every', correct_position: 4 },
    { id: 'tok-6', text: 'day', correct_position: 5 },
  ];

  const bracket: BracketItem = {
    id: 'brk-1',
    original_word: 'go',
    accepted_answers: ['goes'],
    case_sensitive: false,
  };

  const q1: Question = {
    id: 'q-1',
    exam_id: 'exam-seed-1',
    type: 'multiple_choice',
    text: 'She ___ to school every day.',
    order_index: 0,
    marks: 1,
    data: { type: 'multiple_choice', options: [optA, optB, optC, optD] },
    created_at: now(),
    updated_at: now(),
  };
  const q2: Question = {
    id: 'q-2',
    exam_id: 'exam-seed-1',
    type: 'ordering',
    text: 'Arrange the words to form a correct sentence.',
    order_index: 1,
    marks: 2,
    data: { type: 'ordering', tokens },
    created_at: now(),
    updated_at: now(),
  };
  const q3: Question = {
    id: 'q-3',
    exam_id: 'exam-seed-1',
    type: 'correct_brackets',
    text: 'Correct the word in brackets.',
    order_index: 2,
    marks: 1,
    data: { type: 'correct_brackets', sentence: 'She (go) to school every day.', brackets: [bracket] },
    created_at: now(),
    updated_at: now(),
  };
  write(QUESTIONS, [q1, q2, q3]);
}
