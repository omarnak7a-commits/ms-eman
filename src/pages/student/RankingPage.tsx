import { Link, useParams } from 'react-router-dom';
import {
  getAttemptById, getExamById, getAttemptsByExam, getStudentById,
} from '@/lib/db';
import { Logo } from '@/components/Logo';

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export function RankingPage() {
  const { id } = useParams<{ id: string }>();
  const attempt = getAttemptById(id!);
  const exam = attempt ? getExamById(attempt.exam_id) : null;

  if (!attempt || !exam) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <Logo size="md" className="mb-4" />
        <p className="text-slate-500">Leaderboard not available.</p>
      </div>
    );
  }

  const leaderboard = getAttemptsByExam(exam.id)
    .filter(a => a.status === 'submitted')
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.time_used_seconds - b.time_used_seconds;
    });

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <div className="flex justify-center mb-5">
        <Logo size="sm" />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-6">
        <div className="bg-blue-600 px-6 py-4 text-center text-white">
          <h1 className="text-lg font-bold">Leaderboard</h1>
          <p className="text-blue-100 text-sm mt-0.5">{exam.title}</p>
        </div>

        {leaderboard.length === 0 ? (
          <div className="px-6 py-8 text-center text-slate-500 text-sm">No results yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {leaderboard.map((a, i) => {
              const student = getStudentById(a.student_id);
              const isMe = a.id === attempt.id;
              const rank = i + 1;
              const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;

              return (
                <div
                  key={a.id}
                  className={`flex items-center gap-4 px-5 py-3.5 ${isMe ? 'bg-blue-50' : ''}`}
                >
                  <div className="w-8 text-center font-bold text-slate-600 text-sm">
                    {medal || <span className="text-slate-400">#{rank}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium text-sm truncate ${isMe ? 'text-blue-700' : 'text-slate-800'}`}>
                      {student?.name || '—'}
                      {isMe && <span className="text-xs ml-1.5 text-blue-500">(you)</span>}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{formatTime(a.time_used_seconds)}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-bold ${isMe ? 'text-blue-700' : 'text-slate-700'}`}>
                      {a.percentage}%
                    </div>
                    <div className="text-xs text-slate-400">{a.score}/{a.max_score}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Link
          to={`/attempt/${id}/result`}
          className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold text-center hover:bg-blue-700"
        >
          Back to Result
        </Link>
        {exam.review_visibility && (
          <Link
            to={`/attempt/${id}/review`}
            className="w-full py-3 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-medium text-center hover:bg-slate-50"
          >
            Review Answers
          </Link>
        )}
      </div>
    </div>
  );
}
