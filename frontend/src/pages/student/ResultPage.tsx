import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { attemptsApi, getAttemptToken, type SubmittedAttempt } from '@/lib/api/attempts';
import { Logo } from '@/components/Logo';
import { LoadingSpinner } from '@/components/LoadingSpinner';

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export function ResultPage() {
  const { id } = useParams<{ id: string }>();
  const token = getAttemptToken(id!) || '';
  const [attempt, setAttempt] = useState<SubmittedAttempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let on = true;
    if (!token) {
      setError('This result link is not available. Please start the exam again from the original link.');
      setLoading(false);
      return;
    }
    attemptsApi
      .result(id!, token)
      .then(r => { if (on) setAttempt(r.attempt); })
      .catch(e => { if (on) setError((e as { message?: string })?.message || 'Result not found.'); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]);

  if (loading) return <LoadingSpinner className="min-h-[60vh]" />;

  if (error || !attempt) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <Logo size="md" className="mb-4" />
        <p className="text-slate-500">{error || 'Result not found.'}</p>
      </div>
    );
  }

  const passed = attempt.percentage >= 50;

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <div className="flex justify-center mb-6"><Logo size="md" /></div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className={`px-6 py-6 text-center ${passed ? 'bg-green-50' : 'bg-red-50'}`}>
          <div className={`text-5xl font-bold mb-1 ${passed ? 'text-green-700' : 'text-red-700'}`}>{attempt.percentage}%</div>
          <div className="text-lg font-semibold text-slate-700">{attempt.score} / {attempt.max_score}</div>
          <div className="text-sm text-slate-500 mt-1">{attempt.student_name}</div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="text-base font-bold text-slate-800">{formatTime(attempt.time_used_seconds)}</div>
              <div className="text-xs text-slate-500 mt-0.5">Time used</div>
            </div>
            {attempt.ranking_enabled && attempt.rank && (
              <div className="bg-blue-50 rounded-xl p-3">
                <div className="text-sm font-bold text-blue-700">Your Rank: #{attempt.rank}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {attempt.rank} out of {attempt.ranking_total ?? attempt.rank} students
                </div>
              </div>
            )}
            {(!attempt.ranking_enabled || !attempt.rank) && (
              <div className="bg-green-50 rounded-xl p-3">
                <div className="text-base font-bold text-green-700">{attempt.correct_count} ✓</div>
                <div className="text-xs text-slate-500 mt-0.5">Correct</div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {attempt.review_visibility && (
              <Link to={`/attempt/${id}/review`}
                className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold text-center hover:bg-blue-700 transition-colors">
                Review Answers
              </Link>
            )}
            {attempt.ranking_enabled && (
              <Link to={`/attempt/${id}/ranking`}
                className="w-full py-3 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-medium text-center hover:bg-slate-50 transition-colors">
                View Leaderboard
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
