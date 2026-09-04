import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getStudents, getAttemptsByStudent, getExamById } from '@/lib/db';
import { EmptyState } from '@/components/EmptyState';

export function StudentsPage() {
  const [search, setSearch] = useState('');

  const students = useMemo(() => {
    const all = getStudents();
    const term = search.toLowerCase().replace(/\s+/g, ' ').trim();
    return all
      .filter(s => !term || s.normalized_name.includes(term) || s.name.toLowerCase().includes(term))
      .map(s => {
        const attempts = getAttemptsByStudent(s.id).filter(a => a.status === 'submitted');
        const scores = attempts.map(a => a.percentage);
        const lastAttempt = attempts.sort((a, b) =>
          new Date(b.submitted_at || '').getTime() - new Date(a.submitted_at || '').getTime()
        )[0];
        const lastExam = lastAttempt ? getExamById(lastAttempt.exam_id) : null;
        return {
          ...s,
          examCount: attempts.length,
          avgScore: scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : null,
          highestScore: scores.length > 0 ? Math.max(...scores) : null,
          lastExam: lastExam?.title || null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [search]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Students</h1>
        <p className="text-slate-500 text-sm mt-1">{students.length} student{students.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name (Arabic or English)…"
          className="w-full max-w-sm px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl">
        {students.length === 0 ? (
          <EmptyState
            title={search ? 'No students match your search.' : 'No students have completed an exam yet.'}
            description={!search ? 'Students will appear here after they complete their first exam.' : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="px-5 py-3 font-medium">Student</th>
                  <th className="px-5 py-3 font-medium">Exams</th>
                  <th className="px-5 py-3 font-medium">Avg Score</th>
                  <th className="px-5 py-3 font-medium hidden sm:table-cell">Highest</th>
                  <th className="px-5 py-3 font-medium hidden md:table-cell">Last Exam</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {students.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-800">{s.name}</td>
                    <td className="px-5 py-3 text-slate-600">{s.examCount}</td>
                    <td className="px-5 py-3">
                      {s.avgScore !== null
                        ? <span className={`font-semibold ${s.avgScore >= 80 ? 'text-green-600' : s.avgScore >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>{s.avgScore}%</span>
                        : <span className="text-slate-400">—</span>
                      }
                    </td>
                    <td className="px-5 py-3 hidden sm:table-cell">
                      {s.highestScore !== null ? <span className="text-slate-700">{s.highestScore}%</span> : '—'}
                    </td>
                    <td className="px-5 py-3 text-slate-500 text-xs hidden md:table-cell">{s.lastExam || '—'}</td>
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
