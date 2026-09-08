import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { attemptsApi, getAttemptToken } from '@/lib/api/attempts';
import { Logo } from '@/components/Logo';
import { LoadingSpinner } from '@/components/LoadingSpinner';

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export function RankingPage() {
  const { id } = useParams<{ id: string }>();
  const token = getAttemptToken(id!) || '';
  const [data, setData] = useState<{
    exam_title: string;
    entries: Array<{ rank: number; student_name: string; percentage: number; score: number; max_score: number; time_used_seconds: number; attempt_id: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let on = true;
    if (!token) { setError('Leaderboard not available.'); setLoading(false); return; }
    attemptsApi
      .ranking(id!, token)
      .then(r => { if (on) setData({ exam_title: r.exam_title, entries: r.entries }); })
      .catch(e => { if (on) setError((e as { message?: string })?.message || 'Leaderboard not available.'); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]);

  if (loading) return <LoadingSpinner className="min-h-[60vh]" />;

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <Logo size="md" className="mb-4" />
        <p className="text-slate-500">{error || 'Leaderboard not available.'}</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-6" translate="no">
      <div className="flex justify-center mb-5"><Logo size="sm" /></div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-6">
        <div className="bg-blue-600 px-6 py-4 text-center text-white">
          <h1 className="text-lg font-bold">Leaderboard</h1>
          <p className="text-blue-100 text-sm mt-0.5" translate="no">{data.exam_title}</p>
        </div>

        {data.entries.length === 0 ? (
          <div className="px-6 py-8 text-center text-slate-500 text-sm">No results yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.entries.map(entry => {
              const isMe = entry.attempt_id === id;
              const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : null;
              return (
                <div key={entry.attempt_id} className={`flex items-center gap-4 px-5 py-3.5 ${isMe ? 'bg-blue-50' : ''}`}>
                  <div className="w-8 text-center font-bold text-slate-600 text-sm">
                    {medal || <span className="text-slate-400">#{entry.rank}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium text-sm truncate ${isMe ? 'text-blue-700' : 'text-slate-800'}`}>
                      {entry.student_name || '—'}{isMe && <span className="text-xs ml-1.5 text-blue-500">(you)</span>}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{formatTime(entry.time_used_seconds)}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-bold ${isMe ? 'text-blue-700' : 'text-slate-700'}`}>{entry.percentage}%</div>
                    <div className="text-xs text-slate-400">{entry.score}/{entry.max_score}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Link to={`/attempt/${id}/result`}
          className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold text-center hover:bg-blue-700">Back to Result</Link>
      </div>
    </div>
  );
}
