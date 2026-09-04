import { useState, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { getExamBySlug, getQuestionsByExam, findOrCreateStudent, createAttempt } from '@/lib/db';

export function ExamStartPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const exam = getExamBySlug(slug!);
  const questions = exam ? getQuestionsByExam(exam.id) : [];

  if (!exam) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <Logo size="md" className="mb-6" />
        <h1 className="text-xl font-bold text-slate-800 mb-2">Exam Not Found</h1>
        <p className="text-slate-500 text-sm">This exam link is invalid or has been removed.</p>
      </div>
    );
  }

  if (exam.status === 'draft') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <Logo size="md" className="mb-6" />
        <h1 className="text-xl font-bold text-slate-800 mb-2">Exam Not Available</h1>
        <p className="text-slate-500 text-sm">This exam has not been published yet.</p>
      </div>
    );
  }

  if (exam.status === 'closed') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <Logo size="md" className="mb-6" />
        <h1 className="text-xl font-bold text-slate-800 mb-2">Exam Closed</h1>
        <p className="text-slate-500 text-sm">This exam is no longer accepting submissions.</p>
      </div>
    );
  }

  const handleStart = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length < 2) { setError('Please enter your full name (at least 2 characters).'); return; }
    setError('');
    setLoading(true);
    try {
      const student = findOrCreateStudent(trimmed);
      const attempt = createAttempt(exam.id, student.id);
      navigate(`/attempt/${attempt.id}`);
    } catch (err) {
      setError('Failed to start exam. Please try again.');
      setLoading(false);
    }
  };

  const totalMarks = questions.reduce((s, q) => s + q.marks, 0);

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <div className="flex justify-center mb-6">
        <Logo size="md" />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="bg-blue-600 px-6 py-5 text-white text-center">
          <h1 className="text-xl font-bold">{exam.title}</h1>
          {exam.description && <p className="text-blue-100 text-sm mt-1">{exam.description}</p>}
        </div>

        <div className="px-6 py-5">
          <div className="flex justify-around text-center mb-5 pb-5 border-b border-slate-100">
            <div>
              <div className="text-xl font-bold text-slate-800">{questions.length}</div>
              <div className="text-xs text-slate-500 mt-0.5">Questions</div>
            </div>
            <div>
              <div className="text-xl font-bold text-slate-800">{exam.duration_minutes}</div>
              <div className="text-xs text-slate-500 mt-0.5">Minutes</div>
            </div>
            <div>
              <div className="text-xl font-bold text-slate-800">{totalMarks}</div>
              <div className="text-xs text-slate-500 mt-0.5">Total marks</div>
            </div>
          </div>

          {exam.instructions && (
            <div className="mb-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">Instructions</h2>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{exam.instructions}</p>
            </div>
          )}

          <form onSubmit={handleStart}>
            <label className="block text-sm font-medium text-slate-700 mb-1">Your full name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Enter your name (Arabic or English)"
              dir="auto"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
            />
            {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

            <div className="mt-2 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-xs text-amber-800">
                <strong>Important:</strong> Once you start, the timer will begin. You cannot pause or resume the exam.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors text-base"
            >
              {loading ? 'Starting…' : 'Start Exam'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
