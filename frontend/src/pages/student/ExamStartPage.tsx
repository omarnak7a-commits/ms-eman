import { useState, FormEvent, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { attemptsApi, getAttemptToken, setAttemptToken, type ExamPublicInfo } from '@/lib/api/attempts';
import { storageKeys } from '@/lib/storage';
import { LoadingSpinner } from '@/components/LoadingSpinner';

const ATTEMPT_TOKEN_PREFIX = 'ty_attempt_';

/**
 * When "Start" is refused because this student already has an ACTIVE attempt,
 * the only way back in is the attempt token this device received when the
 * attempt began (kept under ty_attempt_<id>). Scan ONLY this device's own
 * tokens and resume the one that belongs to this exam, to the typed name, and
 * is still running — no server change weakens the name-based identity model,
 * and no other student's attempt id/token is ever touched or exposed.
 */
async function findResumableAttempt(examId: string, studentName: string): Promise<{ id: string; token: string } | null> {
  const expected = studentName.trim().toLowerCase();
  for (const key of storageKeys(ATTEMPT_TOKEN_PREFIX)) {
    const attemptId = key.slice(ATTEMPT_TOKEN_PREFIX.length);
    if (!attemptId) continue;
    const token = getAttemptToken(attemptId);
    if (!token) continue;
    try {
      const st = await attemptsApi.status(attemptId, token);
      if (
        st.exam_id === examId &&
        st.status === 'active' &&
        st.can_resume &&
        st.student_name?.trim().toLowerCase() === expected
      ) {
        return { id: attemptId, token };
      }
    } catch {
      // Stale/invalid token for an old attempt — keep scanning.
    }
  }
  return null;
}

export function ExamStartPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [info, setInfo] = useState<ExamPublicInfo | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let on = true;
    attemptsApi
      .examInfo(slug!)
      .then(d => { if (on) setInfo(d); })
      .catch(e => { if (on) setLoadError((e as { message?: string })?.message || 'Exam not available.'); })
      .finally(() => { if (on) setLoadingInfo(false); });
    return () => { on = false; };
  }, [slug]);

  const handleStart = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length < 2) { setError('Please enter your full name (at least 2 characters).'); return; }
    setError('');
    setStarting(true);
    try {
      const attempt = await attemptsApi.start(slug!, trimmed);
      setAttemptToken(attempt.attempt_id, attempt.student_token);
      navigate(`/attempt/${attempt.attempt_id}`, { replace: true });
    } catch (err) {
      const msg = (err as { message?: string })?.message || 'Failed to start exam. Please try again.';
      // Reopening the shared exam link mid-attempt: the server refuses a
      // second start, but if this device still holds the token for the
      // running attempt, jump straight back into it.
      const resumable = info ? await findResumableAttempt(info.id, trimmed) : null;
      if (resumable) {
        setAttemptToken(resumable.id, resumable.token);
        navigate(`/attempt/${resumable.id}`, { replace: true });
        return;
      }
      setError(msg);
      setStarting(false);
    }
  };

  if (loadingInfo) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!info) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <Logo size="md" className="mb-6" />
        <h1 className="text-xl font-bold text-slate-800 mb-2">Exam Not Available</h1>
        <p className="text-slate-500 text-sm">{loadError || 'This exam link is invalid, closed, or has been removed.'}</p>
      </div>
    );
  }

  // Guard against empty exams so starting one can never produce a silent 0.
  if (info.question_count === 0) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="bg-blue-600 px-6 py-5 text-white text-center">
            <h2 className="text-xl font-bold">{info.title}</h2>
          </div>
          <div className="px-6 py-12 text-center">
            <p className="text-lg font-semibold text-slate-800 mb-1">This exam has no questions yet.</p>
            <p className="text-sm text-slate-500">Please check back later.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <div className="flex justify-center mb-6">
        <Logo size="md" />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-4 text-center border-b border-slate-100">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-medium mb-1">Presented by</p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight">Ms Eman Zahy</h1>
        </div>

        <div className="bg-blue-600 px-6 py-5 text-white text-center">
          <h2 className="text-xl font-bold">{info.title}</h2>
          {info.description && <p className="text-blue-100 text-sm mt-1">{info.description}</p>}
        </div>

        <div className="px-6 py-5">
          <div className="flex justify-around text-center mb-5 pb-5 border-b border-slate-100">
            <div>
              <div className="text-xl font-bold text-slate-800">{info.question_count}</div>
              <div className="text-xs text-slate-500 mt-0.5">Questions</div>
            </div>
            <div>
              <div className="text-xl font-bold text-slate-800">{info.duration_minutes}</div>
              <div className="text-xs text-slate-500 mt-0.5">Minutes</div>
            </div>
            <div>
              <div className="text-xl font-bold text-slate-800">{info.max_score}</div>
              <div className="text-xs text-slate-500 mt-0.5">Total marks</div>
            </div>
          </div>

          {info.instructions && (
            <div className="mb-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">Instructions</h2>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{info.instructions}</p>
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
              disabled={starting}
              className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors text-base"
            >
              {starting ? 'Starting…' : 'Start Exam'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
