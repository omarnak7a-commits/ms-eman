import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { resultsApi, type ResultAttemptRow } from '@/lib/api/results';
import { examsApi } from '@/lib/api/exams';
import { useAsync } from '@/hooks/useAsync';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSpinner } from '@/components/LoadingSpinner';

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export function ExamResultsPage() {
  const { id } = useParams<{ id: string }>();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'rank' | 'score' | 'time' | 'name'>('rank');

  const { data: exam, loading: examLoading, error: examError } = useAsync(
    () => examsApi.get(id!),
    [id],
  );
  const { data: res, loading, error } = useAsync(
    () => resultsApi.examResults(id!),
    [id],
  );

  const finished = useMemo(
    () => (res?.attempts || []).filter(a => a.status === 'submitted' || a.status === 'expired'),
    [res],
  );

  const stats = useMemo(() => {
    if (finished.length === 0) return null;
    return {
      avg: Math.round(res!.summary.average_percentage),
      highest: Math.round(res!.summary.highest_percentage),
      lowest: Math.round(res!.summary.lowest_percentage),
    };
  }, [finished, res]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    const rows = finished.filter(a => !term || a.student_name.toLowerCase().includes(term));
    return rows.sort((a, b) => {
      if (sortBy === 'rank') return (a.rank ?? 999) - (b.rank ?? 999);
      if (sortBy === 'score') return b.percentage - a.percentage;
      if (sortBy === 'time') return a.time_used_seconds - b.time_used_seconds;
      return a.student_name.localeCompare(b.student_name);
    });
  }, [finished, search, sortBy]);

  if (examLoading || (loading && !res)) return <LoadingSpinner className="py-20" />;
  if (examError || error) {
    return <div className="p-8 text-center text-slate-500">{examError || error}</div>;
  }
  if (!exam) return <div className="p-8 text-center text-slate-500">Exam not found.</div>;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-6">
        <Link to="/exams" className="hover:text-blue-600">Exams</Link>
        <span>/</span>
        <Link to={`/exams/${id}`} className="hover:text-blue-600">{exam.title}</Link>
        <span>/</span>
        <span className="text-slate-700">Results</span>
      </div>

      <h1 className="text-2xl font-bold text-slate-800 mb-1">{exam.title}</h1>
      <p className="text-slate-500 text-sm mb-6">
        {res?.summary.total_attempts ?? 0} total attempts · {res?.summary.completed_attempts ?? 0} completed
      </p>

      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Average', value: `${stats.avg}%` },
            { label: 'Highest', value: `${stats.highest}%` },
            { label: 'Lowest', value: `${stats.lowest}%` },
          ].map(s => (
            <div key={s.label} className="bg-white border border-slate-200 rounded-2xl p-4 text-center">
              <div className="text-xl font-bold text-slate-800">{s.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl">
        <div className="p-4 border-b border-slate-100 flex gap-3 flex-wrap">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search students…"
            className="flex-1 min-w-32 px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as typeof sortBy)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="rank">Sort by rank</option>
            <option value="score">Sort by score</option>
            <option value="time">Sort by time</option>
            <option value="name">Sort by name</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState title="No completed attempts yet." description="Results will appear here once students submit the exam." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="px-5 py-3 font-medium">Rank</th>
                  <th className="px-5 py-3 font-medium">Student</th>
                  <th className="px-5 py-3 font-medium">Score</th>
                  <th className="px-5 py-3 font-medium">%</th>
                  <th className="px-5 py-3 font-medium hidden sm:table-cell">Time</th>
                  <th className="px-5 py-3 font-medium hidden md:table-cell">Submitted</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((attempt: ResultAttemptRow) => (
                  <tr key={attempt.attempt_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-bold text-slate-600">{attempt.rank ?? '—'}</td>
                    <td className="px-5 py-3 font-medium text-slate-800">{attempt.student_name || '—'}</td>
                    <td className="px-5 py-3 text-slate-700">{attempt.score}/{attempt.max_score}</td>
                    <td className="px-5 py-3">
                      <span className={`font-semibold ${attempt.percentage >= 80 ? 'text-green-600' : attempt.percentage >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {attempt.percentage}%
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-500 hidden sm:table-cell">{formatTime(attempt.time_used_seconds)}</td>
                    <td className="px-5 py-3 text-slate-500 hidden md:table-cell">
                      {attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <Link to={`/exams/${id}/results/${attempt.attempt_id}`} className="text-blue-600 text-xs hover:text-blue-700 font-medium">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
