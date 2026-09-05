import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getSession } from '@/lib/auth';
import { dashboardApi } from '@/lib/api/dashboard';
import { useAsync } from '@/hooks/useAsync';
import { ExamStatusBadge } from '@/components/StatusBadge';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { EmptyState } from '@/components/EmptyState';
import { copyToClipboard } from '@/lib/clipboard';
import { examStudentUrl } from '@/lib/examLink';
import type { Exam } from '@/types';

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="text-2xl font-bold text-slate-800">{value}</div>
      <div className="text-sm text-slate-500 mt-1">{label}</div>
    </div>
  );
}

export function DashboardPage() {
  const teacher = getSession();
  const { data: stats, loading, error } = useAsync(() => dashboardApi.summary(), []);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyLink = async (exam: Exam) => {
    const ok = await copyToClipboard(examStudentUrl(exam.slug));
    if (ok) {
      setCopiedId(exam.id);
      window.setTimeout(() => setCopiedId(cur => (cur === exam.id ? null : cur)), 2000);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">Welcome back, {teacher?.name || 'Teacher'}</p>
      </div>

      {loading ? (
        <LoadingSpinner className="py-16" />
      ) : error ? (
        <div className="rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm p-4 mb-6">{error}</div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard label="Total Exams" value={stats.total_exams} />
            <StatCard label="Total Students" value={stats.total_students} />
            <StatCard label="Total Attempts" value={stats.total_attempts} />
            <StatCard label="Average Score" value={`${Math.round(stats.average_score)}%`} />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">Recent Exams</h2>
              <Link to="/exams/new" className="text-sm text-blue-600 font-medium hover:text-blue-700">
                + Create Exam
              </Link>
            </div>
            {stats.recent_exams.length === 0 ? (
              <EmptyState
                title="No exams yet."
                description="Create your first exam to get started."
                action={
                  <Link to="/exams/new" className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
                    Create Exam
                  </Link>
                }
              />
            ) : (
              <div className="divide-y divide-slate-100">
                {stats.recent_exams.map(exam => (
                  <div key={exam.id} className="px-6 py-4 flex items-center gap-4 flex-wrap sm:flex-nowrap">
                    <div className="flex-1 min-w-0">
                      <Link to={`/exams/${exam.id}`} className="font-medium text-slate-800 hover:text-blue-600 truncate block">
                        {exam.title}
                      </Link>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {exam.question_count} questions · {exam.duration_minutes} min
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleCopyLink(exam)}
                        className="text-xs font-medium px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50"
                        title="Copy student exam link"
                      >
                        {copiedId === exam.id ? '✓ Copied!' : 'Copy Link'}
                      </button>
                      <Link
                        to={`/exams/${exam.id}`}
                        className="text-xs font-medium px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50"
                        title="Edit exam"
                      >
                        Edit
                      </Link>
                    </div>
                    <ExamStatusBadge status={exam.status} />
                    <div className="text-right hidden sm:block">
                      <div className="text-sm font-medium text-slate-700">{exam.attempt_count} attempts</div>
                      {exam.completed_count > 0 && (
                        <div className="text-xs text-slate-500">{Math.round(exam.average_percentage)}% avg</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
