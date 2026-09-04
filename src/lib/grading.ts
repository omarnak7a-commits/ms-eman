import type { Question, Answer, ExamAttempt } from '@/types';
import {
  getQuestionsByExam, getAttemptById, getAnswersByAttempt,
  getAnswers, getAttempts, now,
} from './db';

function normalizeText(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

export interface GradeResult {
  is_correct: boolean;
  awarded_marks: number;
}

export function gradeAnswer(question: Question, answerData: Answer['answer_data']): GradeResult {
  if (question.type === 'multiple_choice' && answerData.type === 'multiple_choice') {
    if (question.data.type !== 'multiple_choice') return { is_correct: false, awarded_marks: 0 };
    const correct = question.data.options.find(o => o.is_correct);
    const is_correct = !!correct && correct.id === answerData.selected_option_id;
    return { is_correct, awarded_marks: is_correct ? question.marks : 0 };
  }

  if (question.type === 'ordering' && answerData.type === 'ordering') {
    if (question.data.type !== 'ordering') return { is_correct: false, awarded_marks: 0 };
    const correct = [...question.data.tokens].sort((a, b) => a.correct_position - b.correct_position);
    const correctIds = correct.map(t => t.id);
    const is_correct = JSON.stringify(answerData.token_ids) === JSON.stringify(correctIds);
    return { is_correct, awarded_marks: is_correct ? question.marks : 0 };
  }

  if (question.type === 'correct_brackets' && answerData.type === 'correct_brackets') {
    if (question.data.type !== 'correct_brackets') return { is_correct: false, awarded_marks: 0 };
    const bracket = question.data.brackets[0];
    if (!bracket) return { is_correct: false, awarded_marks: 0 };
    const studentAnswer = bracket.case_sensitive
      ? answerData.answer.trim()
      : normalizeText(answerData.answer);
    const accepted = bracket.accepted_answers.map(a =>
      bracket.case_sensitive ? a.trim() : normalizeText(a)
    );
    const is_correct = accepted.includes(studentAnswer);
    return { is_correct, awarded_marks: is_correct ? question.marks : 0 };
  }

  return { is_correct: false, awarded_marks: 0 };
}

export function gradeAttempt(attemptId: string): ExamAttempt | null {
  const attempt = getAttemptById(attemptId);
  if (!attempt) return null;
  if (attempt.status !== 'active') return attempt;

  const questions = getQuestionsByExam(attempt.exam_id);
  const answers = getAnswersByAttempt(attemptId);
  const allAnswers = getAnswers();

  let score = 0;
  const max_score = questions.reduce((sum, q) => sum + q.marks, 0);

  const updatedAnswers = allAnswers.map(ans => {
    if (ans.attempt_id !== attemptId) return ans;
    const q = questions.find(q => q.id === ans.question_id);
    if (!q) return ans;
    const result = gradeAnswer(q, ans.answer_data);
    score += result.awarded_marks;
    return { ...ans, ...result, updated_at: now() };
  });
  localStorage.setItem('ty_answers', JSON.stringify(updatedAnswers));

  const submitted_at = now();
  const time_used_seconds = Math.floor(
    (new Date(submitted_at).getTime() - new Date(attempt.started_at).getTime()) / 1000
  );
  const percentage = max_score > 0 ? Math.round((score / max_score) * 100) : 0;

  const allAttempts = getAttempts();
  const updatedAttempts = allAttempts.map(a => {
    if (a.id !== attemptId) return a;
    return {
      ...a,
      status: 'submitted' as const,
      submitted_at,
      score,
      max_score,
      percentage,
      time_used_seconds,
    };
  });
  localStorage.setItem('ty_attempts', JSON.stringify(updatedAttempts));

  // Recalculate ranks for the exam
  const examAttempts = updatedAttempts
    .filter(a => a.exam_id === attempt.exam_id && a.status === 'submitted')
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.time_used_seconds - b.time_used_seconds;
    });

  const ranked = updatedAttempts.map(a => {
    if (a.exam_id !== attempt.exam_id || a.status !== 'submitted') return a;
    const rank = examAttempts.findIndex(x => x.id === a.id) + 1;
    return { ...a, rank };
  });
  localStorage.setItem('ty_attempts', JSON.stringify(ranked));

  return ranked.find(a => a.id === attemptId) || null;
}
