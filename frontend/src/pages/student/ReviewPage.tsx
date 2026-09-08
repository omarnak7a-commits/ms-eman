import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { attemptsApi, getAttemptToken } from '@/lib/api/attempts';
import { formatCorrectAnswer, formatStudentAnswer } from '@/lib/formatAnswers';
import { Logo } from '@/components/Logo';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { QuestionPrompt } from '@/components/QuestionPrompt';
import { ExamTeacherName } from '@/components/ExamTeacherName';

interface ReviewItem {
  question_id: string;
  question_type: string;
  text: string;
  marks: number;
  student_answer: unknown;
  correct_answer: unknown;
  is_correct: boolean | null;
}

export function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const token = getAttemptToken(id!) || '';
  const [data, setData] = useState<{ exam_title: string; items: ReviewItem[]; ranking_enabled: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let on = true;
    if (!token) { setError('Review not available.'); setLoading(false); return; }
    attemptsApi
      .review(id!, token)
      .then(r => {
        if (!on) return;
        setData({ exam_title: r.exam_title, items: r.items as unknown as ReviewItem[], ranking_enabled: r.ranking_enabled });
      })
      .catch(e => { if (on) setError((e as { message?: string })?.message || 'Review not available.'); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]);

  if (loading) return <LoadingSpinner className="min-h-[60vh]" />;

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <Logo size="md" className="mb-4" />
        <p className="text-slate-500">{error || 'Review not available.'}</p>
      </div>
    );
  }

  const correctCount = data.items.filter(i => i.is_correct === true).length;
  const incorrectCount = data.items.filter(i => i.is_correct === false).length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6" translate="no">
      <div className="flex justify-center mb-1"><Logo size="sm" /></div>
      <ExamTeacherName className="mb-5" />

      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Answer Review</h1>
          <p className="text-sm text-slate-500" translate="no">{data.exam_title}</p>
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
        {data.items.map((item, i) => {
          const isCorrect = item.is_correct;
          const studentAnswer = formatStudentAnswer(item.question_type, item.student_answer, item.correct_answer);
          const correctAnswer = formatCorrectAnswer(item.question_type, item.correct_answer);
          return (
            <div key={item.question_id} className={`bg-white border rounded-2xl p-5 ${
              isCorrect === true ? 'border-green-200' : isCorrect === false ? 'border-red-200' : 'border-slate-200'
            }`}>
              <div className="flex items-start gap-3 mb-3">
                <span className="text-xs font-bold text-slate-400 mt-0.5">Q{i + 1}</span>
                <div className="flex-1">
                  <QuestionPrompt
                    type={item.question_type}
                    text={item.text}
                    className="text-slate-800 font-medium text-sm leading-relaxed"
                    bodyClassName="text-slate-600 text-sm leading-relaxed"
                  />
                </div>
                <span className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-lg ${
                  isCorrect === true ? 'bg-green-100 text-green-700' : isCorrect === false ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                }`}>
                  {isCorrect === true ? '✓ Correct' : isCorrect === false ? '✗ Incorrect' : '—'}
                </span>
              </div>

              <div className="space-y-1.5 text-sm">
                <div className="flex gap-2">
                  <span className="text-slate-500 shrink-0 w-28">Your answer:</span>
                  <span className={`font-medium ${
                    isCorrect === true ? 'text-green-700' : isCorrect === false ? 'text-red-700' : 'text-slate-600'
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
        <Link to={`/attempt/${id}/result`}
          className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold text-center hover:bg-blue-700">Back to Result</Link>
        {data.ranking_enabled && (
          <Link to={`/attempt/${id}/ranking`}
            className="w-full py-3 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-medium text-center hover:bg-slate-50">View Leaderboard</Link>
        )}
      </div>
    </div>
  );
}
