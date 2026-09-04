import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getSession } from '@/lib/auth';
import {
  getExamsByTeacher, getQuestionsByExam, getAttempts,
  deleteExam, duplicateExam,
} from '@/lib/db';
import { ExamStatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { Exam } from '@/types';

export function ExamsPage() {
  const teacher = getSession()!;
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState<Exam | null>(null);
  const [, forceUpdate] = useState(0);
  const refresh = () => forceUpdate(n => n + 1);

  const exams = useMemo(() =>
    getExamsByTeacher(teacher.id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [teacher.id, forceUpdate]
  );

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteExam(deleteTarget.id);
    setDeleteTarget(null);
    refresh();
  };

  const handleDuplicate = (exam: Exam) => {
    const copy = duplicateExam(exam.id, teacher.id);
    if (copy) { refresh(); navigate(`/exams/${copy.id}`); }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Exams</h1>
          <p className="text-sm text-slate-500 mt-1">{exams.length} exam{exams.length !== 1 ? 's' : ''}</p>
        </div>
        <Link
          to="/exams/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Create Exam
        </Link>
      </div>

      {exams.length === 0 ? (
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
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
          {exams.map(exam => {
            const questions = getQuestionsByExam(exam.id);
            const attempts = getAttempts().filter(a => a.exam_id === exam.id);
            const submitted = attempts.filter(a => a.status === 'submitted');
            const avg = submitted.length > 0
              ? Math.round(submitted.reduce((s, a) => s + a.percentage, 0) / submitted.length)
              : null;

            return (
              <div key={exam.id} className="px-5 py-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link to={`/exams/${exam.id}`} className="font-medium text-slate-800 hover:text-blue-600">
                      {exam.title}
                    </Link>
                    <ExamStatusBadge status={exam.status} />
                  </div>
                  <div className="text-xs text-slate-500 mt-1 flex gap-3 flex-wrap">
                    <span>{questions.length} questions</span>
                    <span>{exam.duration_minutes} min</span>
                    <span>{attempts.length} attempt{attempts.length !== 1 ? 's' : ''}</span>
                    {avg !== null && <span>{avg}% avg</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {exam.status === 'submitted' || exam.status === 'published' || exam.status === 'active' ? (
                    <Link to={`/exams/${exam.id}/results`} className="text-xs text-blue-600 font-medium hover:text-blue-700">
                      Results
                    </Link>
                  ) : null}
                  <button
                    onClick={() => handleDuplicate(exam)}
                    className="text-xs text-slate-500 hover:text-slate-700"
                  >
                    Copy
                  </button>
                  <button
                    onClick={() => setDeleteTarget(exam)}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
