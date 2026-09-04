import { useParams, Link } from 'react-router-dom';
import {
  getAttemptById, getStudentById, getExamById,
  getQuestionsByExam, getAnswersByAttempt,
} from '@/lib/db';
import type { Question, Answer } from '@/types';

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

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

export function AttemptDetailPage() {
  const { id, attemptId } = useParams<{ id: string; attemptId: string }>();

  const attempt = getAttemptById(attemptId!);
  const student = attempt ? getStudentById(attempt.student_id) : null;
  const exam = attempt ? getExamById(attempt.exam_id) : null;
  const questions = exam ? getQuestionsByExam(exam.id) : [];
  const answers = attempt ? getAnswersByAttempt(attempt.id) : [];

  if (!attempt || !exam) return <div className="p-8 text-center text-slate-500">Attempt not found.</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-6">
        <Link to="/exams" className="hover:text-blue-600">Exams</Link>
        <span>/</span>
        <Link to={`/exams/${id}`} className="hover:text-blue-600">{exam.title}</Link>
        <span>/</span>
        <Link to={`/exams/${id}/results`} className="hover:text-blue-600">Results</Link>
        <span>/</span>
        <span className="text-slate-700">{student?.name}</span>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800">{student?.name}</h1>
            <p className="text-slate-500 text-sm mt-0.5">{exam.title}</p>
          </div>
          {attempt.rank && exam.ranking_enabled && (
            <div className="text-center bg-blue-50 rounded-2xl px-4 py-2">
              <div className="text-xl font-bold text-blue-700">#{attempt.rank}</div>
              <div className="text-xs text-blue-500">Rank</div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          {[
            { label: 'Score', value: `${attempt.score}/${attempt.max_score}` },
            { label: 'Percentage', value: `${attempt.percentage}%` },
            { label: 'Time', value: formatTime(attempt.time_used_seconds) },
            { label: 'Submitted', value: attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleTimeString() : '—' },
          ].map(s => (
            <div key={s.label} className="bg-slate-50 rounded-xl p-3">
              <div className="text-base font-bold text-slate-800">{s.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {questions.map((q, i) => {
          const answer = answers.find(a => a.question_id === q.id);
          const studentAnswer = getStudentAnswer(q, answer);
          const correct = getCorrectAnswer(q);
          const isCorrect = answer?.is_correct;

          return (
            <div key={q.id} className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-start gap-3 mb-3">
                <span className="text-xs font-bold text-slate-400 mt-1">Q{i + 1}</span>
                <p className="text-slate-800 font-medium flex-1">{q.text}</p>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  isCorrect === true ? 'bg-green-100 text-green-700' :
                  isCorrect === false ? 'bg-red-100 text-red-700' :
                  'bg-slate-100 text-slate-600'
                }`}>
                  {isCorrect === true ? `+${q.marks}` : isCorrect === false ? '0' : '—'}
                </span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="text-slate-500 w-28 shrink-0">Student answer:</span>
                  <span className={`font-medium ${
                    isCorrect === true ? 'text-green-700' :
                    isCorrect === false ? 'text-red-700' :
                    'text-slate-600'
                  }`}>{studentAnswer}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-slate-500 w-28 shrink-0">Correct answer:</span>
                  <span className="font-medium text-slate-800">{correct}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
