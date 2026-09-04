import { Link, useParams } from 'react-router-dom';
import { getAttemptById, getExamById, getStudentById } from '@/lib/db';
import { Logo } from '@/components/Logo';

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export function ResultPage() {
  const { id } = useParams<{ id: string }>();
  const attempt = getAttemptById(id!);
  const exam = attempt ? getExamById(attempt.exam_id) : null;
  const student = attempt ? getStudentById(attempt.student_id) : null;

  if (!attempt || !exam) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <Logo size="md" className="mb-4" />
        <p className="text-slate-500">Result not found.</p>
      </div>
    );
  }

  const passed = attempt.percentage >= 50;
  const correct = 0; // will be computed from answers
  const wrongCount = 0;

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <div className="flex justify-center mb-6">
        <Logo size="md" />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className={`px-6 py-6 text-center ${passed ? 'bg-green-50' : 'bg-red-50'}`}>
          <div className={`text-5xl font-bold mb-1 ${passed ? 'text-green-700' : 'text-red-700'}`}>
            {attempt.percentage}%
          </div>
          <div className="text-lg font-semibold text-slate-700">{attempt.score} / {attempt.max_score}</div>
          <div className="text-sm text-slate-500 mt-1">{student?.name}</div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="text-base font-bold text-slate-800">{formatTime(attempt.time_used_seconds)}</div>
              <div className="text-xs text-slate-500 mt-0.5">Time used</div>
            </div>
            {exam.ranking_enabled && attempt.rank && (
              <div className="bg-blue-50 rounded-xl p-3">
                <div className="text-base font-bold text-blue-700">#{attempt.rank}</div>
                <div className="text-xs text-slate-500 mt-0.5">Your rank</div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {exam.review_visibility && (
              <Link
                to={`/attempt/${id}/review`}
                className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold text-center hover:bg-blue-700 transition-colors"
              >
                Review Answers
              </Link>
            )}
            {exam.ranking_enabled && (
              <Link
                to={`/attempt/${id}/ranking`}
                className="w-full py-3 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-medium text-center hover:bg-slate-50 transition-colors"
              >
                View Leaderboard
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
