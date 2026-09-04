import { Link, useParams } from 'react-router-dom';
import {
  getAttemptById, getExamById, getQuestionsByExam, getAnswersByAttempt,
} from '@/lib/db';
import { Logo } from '@/components/Logo';
import type { Question, Answer } from '@/types';

function getCorrectAnswer(question: Question): string {
  if (question.data.type === 'multiple_choice') {
    return question.data.options.find(o => o.is_correct)?.text || '—';
  }
  if (question.data.type === 'ordering') {
    return question.data.tokens
      .sort((a, b) => a.correct_position - b.correct_position)
      .map(t => t.text)
      .join(' ');
  }
  if (question.data.type === 'correct_brackets') {
    return question.data.brackets[0]?.accepted_answers.join(' / ') || '—';
  }
  return '—';
}

function getStudentAnswer(question: Question, answer: Answer | undefined): string {
  if (!answer) return '(not answered)';
  const ad = answer.answer_data;
  if (ad.type === 'multiple_choice' && question.data.type === 'multiple_choice') {
    return question.data.options.find(o => o.id === ad.selected_option_id)?.text || ad.selected_option_id;
  }
  if (ad.type === 'ordering' && question.data.type === 'ordering') {
    return ad.token_ids.map(id => question.data.tokens.find(t => t.id === id)?.text || '?').join(' ');
  }
  if (ad.type === 'correct_brackets') {
    return ad.answer;
  }
  return '—';
}

export function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const attempt = getAttemptById(id!);
  const exam = attempt ? getExamById(attempt.exam_id) : null;
  const questions = exam ? getQuestionsByExam(exam.id) : [];
  const answers = attempt ? getAnswersByAttempt(attempt.id) : [];

  if (!attempt || !exam || attempt.status !== 'submitted') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <Logo size="md" className="mb-4" />
        <p className="text-slate-500">Review not available.</p>
      </div>
    );
  }

  const correctCount = answers.filter(a => a.is_correct).length;
  const incorrectCount = answers.filter(a => a.is_correct === false).length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex justify-center mb-5">
        <Logo size="sm" />
      </div>

      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Answer Review</h1>
          <p className="text-sm text-slate-500">{exam.title}</p>
        </div>
        <div className="flex gap-3 text-center">
          <div className="bg-green-50 rounded-xl px-3 py-2">
            <div className="text-base font-bold text-green-700">{correctCount}</div>
            <div className="text-xs text-slate-500">Correct</div>
          </div>
          <div className="bg-red-50 rounded-xl px-3 py-2">
            <div className="text-base font-bold text-red-700">{incorrectCount}</div>
            <div className="text-xs text-slate-500">Incorrect</div>
          </div>
        </div>
      </div>

      <div className="space-y-4 mb-6">
        {questions.map((q, i) => {
          const answer = answers.find(a => a.question_id === q.id);
          const studentAnswer = getStudentAnswer(q, answer);
          const correctAnswer = getCorrectAnswer(q);
          const isCorrect = answer?.is_correct;

          return (
            <div key={q.id} className={`bg-white border rounded-2xl p-5 ${
              isCorrect === true ? 'border-green-200' : isCorrect === false ? 'border-red-200' : 'border-slate-200'
            }`}>
              <div className="flex items-start gap-3 mb-3">
                <span className="text-xs font-bold text-slate-400 mt-0.5">Q{i + 1}</span>
                <p className="text-slate-800 font-medium flex-1 text-sm leading-relaxed">{q.text}</p>
                <span className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-lg ${
                  isCorrect === true ? 'bg-green-100 text-green-700' :
                  isCorrect === false ? 'bg-red-100 text-red-700' :
                  'bg-slate-100 text-slate-600'
                }`}>
                  {isCorrect === true ? '✓ Correct' : isCorrect === false ? '✗ Incorrect' : '—'}
                </span>
              </div>

              <div className="space-y-1.5 text-sm">
                <div className="flex gap-2">
                  <span className="text-slate-500 shrink-0 w-28">Your answer:</span>
                  <span className={`font-medium ${
                    isCorrect === true ? 'text-green-700' :
                    isCorrect === false ? 'text-red-700' :
                    'text-slate-600'
                  }`}>{studentAnswer}</span>
                </div>
                {isCorrect === false && (
                  <div className="flex gap-2">
                    <span className="text-slate-500 shrink-0 w-28">Correct answer:</span>
                    <span className="font-medium text-slate-800">{correctAnswer}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <Link
          to={`/attempt/${id}/result`}
          className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold text-center hover:bg-blue-700"
        >
          Back to Result
        </Link>
        {exam.ranking_enabled && (
          <Link
            to={`/attempt/${id}/ranking`}
            className="w-full py-3 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-medium text-center hover:bg-slate-50"
          >
            View Leaderboard
          </Link>
        )}
      </div>
    </div>
  );
}
