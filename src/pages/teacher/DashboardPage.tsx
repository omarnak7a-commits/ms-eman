import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getSession } from '@/lib/auth';
import { getExamsByTeacher, getStudents, getAttempts, getQuestionsByExam } from '@/lib/db';
import { ExamStatusBadge } from '@/components/StatusBadge';

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="text-2xl font-bold text-slate-800">{value}</div>
      <div className="text-sm text-slate-500 mt-1">{label}</div>
    </div>
  );
}

export function DashboardPage() {
  const teacher = getSession()!;

  const stats = useMemo(() => {
    const exams = getExamsByTeacher(teacher.id);
    const attempts = getAttempts().filter(a => exams.some(e => e.id === a.exam_id));
    const studentIds = new Set(attempts.map(a => a.student_id));
    const submitted = attempts.filter(a => a.status === 'submitted');
    const avgScore = submitted.length > 0
      ? Math.round(submitted.reduce((s, a) => s + a.percentage, 0) / submitted.length)
      : 0;
    return {
      totalExams: exams.length,
      totalStudents: studentIds.size,
      totalAttempts: attempts.length,
      avgScore,
      recentExams: exams
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5),
    };
  }, [teacher.id]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">Welcome back, {teacher.name}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Exams" value={stats.totalExams} />
        <StatCard label="Total Students" value={stats.totalStudents} />
        <StatCard label="Total Attempts" value={stats.totalAttempts} />
        <StatCard label="Average Score" value={`${stats.avgScore}%`} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Recent Exams</h2>
          <Link to="/exams/new" className="text-sm text-blue-600 font-medium hover:text-blue-700">
            + Create Exam
          </Link>
        </div>
        {stats.recentExams.length === 0 ? (
          <div className="px-6 py-8 text-center text-slate-500 text-sm">
            No exams yet.{' '}
            <Link to="/exams/new" className="text-blue-600 font-medium">Create your first exam</Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {stats.recentExams.map(exam => {
              const questions = getQuestionsByExam(exam.id);
              const attempts = getAttempts().filter(a => a.exam_id === exam.id);
              const submitted = attempts.filter(a => a.status === 'submitted');
              const avg = submitted.length > 0
                ? Math.round(submitted.reduce((s, a) => s + a.percentage, 0) / submitted.length)
                : null;
              return (
                <div key={exam.id} className="px-6 py-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <Link to={`/exams/${exam.id}`} className="font-medium text-slate-800 hover:text-blue-600 truncate block">
                      {exam.title}
                    </Link>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {questions.length} questions · {exam.duration_minutes} min
                    </div>
                  </div>
                  <ExamStatusBadge status={exam.status} />
                  <div className="text-right hidden sm:block">
                    <div className="text-sm font-medium text-slate-700">{attempts.length} attempts</div>
                    {avg !== null && <div className="text-xs text-slate-500">{avg}% avg</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
