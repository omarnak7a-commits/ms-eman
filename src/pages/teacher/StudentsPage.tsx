import { useEffect, useState } from 'react';
import { studentsApi, type StudentListItem } from '@/lib/api/students';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export function StudentsPage() {
  const [search, setSearch] = useState('');
  const [students, setStudents] = useState<StudentListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let on = true;
    setLoading(true);
    const t = setTimeout(() => {
      studentsApi
        .list(search.trim() || undefined)
        .then(d => { if (on) setStudents(d); })
        .catch(e => { if (on) setError((e as { message?: string })?.message || 'Failed to load students.'); })
        .finally(() => { if (on) setLoading(false); });
    }, 200);
    return () => { on = false; clearTimeout(t); };
  }, [search]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Students</h1>
        <p className="text-slate-500 text-sm mt-1">
          {students ? `${students.length} student${students.length !== 1 ? 's' : ''}` : ''}
        </p>
      </div>

      {error && <div className="rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm p-4 mb-4">{error}</div>}

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name (Arabic or English)…"
          className="w-full max-w-sm px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {loading ? (
        <LoadingSpinner className="py-16" />
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl">
          {!students || students.length === 0 ? (
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
                      <td className="px-5 py-3 text-slate-600">{s.exam_count}</td>
                      <td className="px-5 py-3">
                        {s.average_percentage > 0
                          ? <span className={`font-semibold ${s.average_percentage >= 80 ? 'text-green-600' : s.average_percentage >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>{Math.round(s.average_percentage)}%</span>
                          : <span className="text-slate-400">—</span>
                        }
                      </td>
                      <td className="px-5 py-3 hidden sm:table-cell">
                        {s.highest_percentage > 0 ? <span className="text-slate-700">{Math.round(s.highest_percentage)}%</span> : '—'}
                      </td>
                      <td className="px-5 py-3 text-slate-500 text-xs hidden md:table-cell">{s.last_exam_title || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
