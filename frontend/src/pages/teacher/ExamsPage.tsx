import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { examsApi, type ExamApiOut } from '@/lib/api/exams';
import { ExamStatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import type { Exam } from '@/types';
import { copyToClipboard } from '@/lib/clipboard';
import { examStudentUrl } from '@/lib/examLink';

export function ExamsPage() {
  const navigate = useNavigate();
  const [exams, setExams] = useState<ExamApiOut[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ExamApiOut | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyLink = async (exam: Exam) => {
    const ok = await copyToClipboard(examStudentUrl(exam.slug));
    if (!ok) {
      setError('Could not copy the link automatically. Please open the exam and copy the student link manually.');
      return;
    }
    setCopiedId(exam.id);
    window.setTimeout(() => setCopiedId(cur => (cur === exam.id ? null : cur)), 2000);
  };

  const load = () => {
    setLoading(true);
    setError('');
    examsApi
      .list()
      .then(d => setExams(d.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())))
      .catch(e => setError((e as { message?: string })?.message || 'Failed to load exams.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await examsApi.remove(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch (e) {
      setError((e as { message?: string })?.message || 'Failed to delete exam.');
    } finally {
      setBusy(false);
    }
  };

  const handleDuplicate = async (exam: Exam) => {
    setBusy(true);
    try {
      const copy = await examsApi.duplicate(exam.id);
      navigate(`/exams/${copy.id}`);
    } catch (e) {
      setError((e as { message?: string })?.message || 'Failed to duplicate exam.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Exams</h1>
          <p className="text-sm text-slate-500 mt-1">
            {exams ? `${exams.length} exam${exams.length !== 1 ? 's' : ''}` : ''}
          </p>
        </div>
        <Link
          to="/exams/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Create Exam
        </Link>
      </div>

      {error && <div className="rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm p-4 mb-6">{error}</div>}

      {loading ? (
        <LoadingSpinner className="py-16" />
      ) : exams && exams.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200">
          <EmptyState
            title="No exams created yet."
            description="Create your first exam to get started."
            action={
              <Link to="/exams/new" className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
                Create Exam
              </Link>
            }
          />
        </div>
      ) : exams ? (
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
          {exams.map(exam => (
            <div key={exam.id} className="px-5 py-4 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link to={`/exams/${exam.id}`} className="font-medium text-slate-800 hover:text-blue-600">
                    {exam.title}
                  </Link>
                  <ExamStatusBadge status={exam.status} />
                </div>
                <div className="text-xs text-slate-500 mt-1 flex gap-3 flex-wrap">
                  <span>{exam.question_count} questions</span>
                  <span>{exam.duration_minutes} min</span>
                  <span>{exam.attempt_count} attempt{exam.attempt_count !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                <button
                  type="button"
                  onClick={() => handleCopyLink(exam)}
                  disabled={busy}
                  className="text-xs font-medium px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50 disabled:opacity-50"
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
                {exam.status !== 'draft' && (
                  <Link
                    to={`/exams/${exam.id}/results`}
                    className="text-xs font-medium px-2.5 py-1 rounded-lg border border-slate-200 text-blue-600 hover:border-blue-300 hover:bg-blue-50"
                  >
                    Results
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => handleDuplicate(exam)}
                  disabled={busy}
                  className="text-xs text-slate-500 hover:text-slate-700 px-1"
                  title="Duplicate exam"
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(exam)}
                  className="text-xs text-red-400 hover:text-red-600 px-1"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Exam"
        message={`Are you sure you want to delete "${deleteTarget?.title}"? This will also delete all attempts and results.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
