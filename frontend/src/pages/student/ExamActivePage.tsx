import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { attemptsApi, getAttemptToken, type StudentQuestion } from '@/lib/api/attempts';
import { useExamTimer } from '@/hooks/useExamTimer';
import { Logo } from '@/components/Logo';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { QuestionPrompt } from '@/components/QuestionPrompt';
import { ExamTeacherName } from '@/components/ExamTeacherName';
import type { AnswerData } from '@/types';

// State for a question's answer. An answer only ever reaches the server when
// the student presses "Submit Answer"; after that it is locked and graded.
interface AnswerEntry {
  data: AnswerData;
  submitted: boolean;
  is_correct: boolean | null;
}

function isAnswerEmpty(data?: AnswerData | null): boolean {
  if (!data) return true;
  if (data.type === 'multiple_choice') return !data.selected_option_id;
  if (data.type === 'ordering') return !data.token_ids || data.token_ids.length === 0;
  if (data.type === 'correct_brackets') {
    if (Array.isArray(data.answer)) return data.answer.every(a => !a || !String(a).trim());
    return !String(data.answer ?? '').trim();
  }
  return true;
}

/**
 * An answer is *complete* when the server can actually grade it. Ordering
 * requires every token exactly once (the backend rejects partial sequences),
 * so a partially-arranged draft must not be submittable — otherwise the
 * student taps "Submit Answer" and only gets a confusing error back.
 */
function isAnswerComplete(data: AnswerData | undefined, question: StudentQuestion): boolean {
  if (!data || isAnswerEmpty(data)) return false;
  if (data.type === 'ordering') {
    const total = question.data.tokens?.length ?? 0;
    return data.token_ids.length === total;
  }
  return true;
}

function errMsg(e: unknown): string {
  return (e as { message?: string })?.message || 'Something went wrong.';
}

// ─── MCQ answer ───────────────────────────────────────────────────────────────

function MCQAnswer({ question, selected, onAnswer, disabled }: {
  question: StudentQuestion;
  selected: string | null;
  onAnswer: (data: AnswerData | null) => void;
  disabled: boolean;
}) {
  if (!question.data.options) return null;
  return (
    <div className="space-y-3">
      {question.data.options.map((opt, i) => {
        const isSelected = selected === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => {
              if (disabled) return;
              // Tapping the already-selected option clears the (still
              // unsubmitted) draft so the student can walk away from the
              // question without being forced to submit something.
              if (isSelected) onAnswer(null);
              else onAnswer({ type: 'multiple_choice', selected_option_id: opt.id });
            }}
            disabled={disabled}
            aria-pressed={isSelected}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 text-left transition-all ${
              isSelected
                ? 'border-blue-500 bg-blue-50 text-blue-800'
                : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50'
            } disabled:cursor-default`}
          >
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
              isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}>
              {String.fromCharCode(65 + i)}
            </span>
            <span className="text-sm font-medium">{opt.text}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Ordering (Tap-to-Arrange) ────────────────────────────────────────────────

function OrderingAnswer({ question, arranged, onAnswer, disabled }: {
  question: StudentQuestion;
  arranged: string[];
  onAnswer: (data: AnswerData) => void;
  disabled: boolean;
}) {
  const tokens = question.data.tokens || [];
  const usedIds = new Set(arranged);
  const available = tokens.filter(t => !usedIds.has(t.id));

  const tapToken = (id: string) => {
    if (disabled) return;
    onAnswer({ type: 'ordering', token_ids: [...arranged, id] });
  };
  const removeFromSlot = (idx: number) => {
    if (disabled) return;
    onAnswer({ type: 'ordering', token_ids: arranged.filter((_, i) => i !== idx) });
  };
  const handleUndo = () => {
    if (disabled || arranged.length === 0) return;
    onAnswer({ type: 'ordering', token_ids: arranged.slice(0, -1) });
  };
  const handleClear = () => {
    if (disabled) return;
    onAnswer({ type: 'ordering', token_ids: [] });
  };

  return (
    <div>
      <div className="mb-4">
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-2">Your answer</p>
        <div className="flex flex-wrap gap-2 min-h-10">
          {tokens.map((_, slotIdx) => {
            const tokenId = arranged[slotIdx];
            const token = tokenId ? tokens.find(t => t.id === tokenId) : null;
            return (
              <button
                key={slotIdx}
                onClick={() => tokenId && removeFromSlot(slotIdx)}
                disabled={disabled}
                className={`px-3 py-2 rounded-xl border-2 text-sm font-medium min-w-12 transition-all ${
                  token
                    ? 'border-blue-400 bg-blue-50 text-blue-800 hover:border-red-400 hover:bg-red-50 hover:text-red-700'
                    : 'border-dashed border-slate-300 text-slate-300'
                } disabled:cursor-default`}
              >
                {token ? token.text : <span className="text-xs">{slotIdx + 1}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-3">
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-2">Available words</p>
        <div className="flex flex-wrap gap-2">
          {available.map(tok => (
            <button
              key={tok.id}
              onClick={() => tapToken(tok.id)}
              disabled={disabled}
              className="px-4 py-2 rounded-xl bg-white border-2 border-slate-200 text-sm font-medium text-slate-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 transition-all disabled:opacity-50 active:scale-95"
            >
              {tok.text}
            </button>
          ))}
          {available.length === 0 && arranged.length === tokens.length && (
            <span className="text-xs text-slate-400 italic">All words placed.</span>
          )}
        </div>
      </div>

      {!disabled && arranged.length > 0 && (
        <div className="flex gap-2">
          <button onClick={handleUndo} disabled={arranged.length === 0}
            className="px-3 py-1.5 rounded-xl text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40">Undo</button>
          <button onClick={handleClear} disabled={arranged.length === 0}
            className="px-3 py-1.5 rounded-xl text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40">Clear</button>
        </div>
      )}
    </div>
  );
}

// ─── Correct Brackets answer ──────────────────────────────────────────────────

// Splits "She (go) to school." into plain parts and "(go)" parts. The old
// pattern searched for backslash-escaped brackets (\(...\)) which never occur
// in stored sentences, so bracketed words were never highlighted.
const BRACKET_SPLIT = /(\([^)]+\))/g;
const BRACKET_TEST = /^\([^)]+\)$/;

function BracketsAnswer({ question, values, onChange, disabled }: {
  question: StudentQuestion;
  /** One value per bracket, in sentence order. */
  values: string[];
  onChange: (next: string[]) => void;
  disabled: boolean;
}) {
  const brackets = question.data.brackets || [];
  const parts = (question.data.sentence || '').split(BRACKET_SPLIT);
  let bracketIdx = -1;
  const setValue = (idx: number, v: string) => {
    const next = values.slice();
    while (next.length < brackets.length) next.push('');
    next[idx] = v;
    onChange(next);
  };
  const hasAnything = values.some(v => v && v.trim());

  return (
    <div>
      <div className="mb-4 p-4 bg-slate-50 rounded-xl text-sm text-slate-800 leading-loose">
        {parts.map((part, i) => {
          if (BRACKET_TEST.test(part)) {
            bracketIdx += 1;
            const idx = bracketIdx;
            return (
              <span key={i} className="inline-flex items-center gap-1 align-baseline whitespace-nowrap">
                <span className="font-semibold text-blue-700">({part.slice(1, -1)})</span>
                <span aria-hidden="true" className="text-slate-400">→</span>
                <input
                  type="text"
                  value={values[idx] || ''}
                  onChange={e => setValue(idx, e.target.value)}
                  disabled={disabled}
                  placeholder="correction…"
                  dir="auto"
                  aria-label={`Correction for bracketed word ${part}`}
                  className="inline-block w-32 sm:w-40 px-3 py-1.5 rounded-lg border-2 border-slate-200 text-sm focus:outline-none focus:border-blue-400 disabled:bg-slate-100 disabled:text-slate-500 transition-colors"
                />
              </span>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </div>
      {!disabled && hasAnything && (
        <button
          type="button"
          onClick={() => onChange(brackets.map(() => ''))}
          className="px-3 py-1.5 rounded-xl text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          Clear
        </button>
      )}
    </div>
  );
}

// ─── Feedback panel ────────────────────────────────────────────────────────────
// Shown after "Submit Answer": the server's verdict (Correct / Incorrect) and
// the lock notice. Deliberately prominent — the solving flow is
// Question → answer → Submit Answer → server grades → feedback → locked.

function FeedbackPanel({ isCorrect }: { isCorrect: boolean | null }) {
  if (isCorrect === null) return null;
  return (
    <div
      role="status"
      className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 ${
        isCorrect ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'
      }`}
    >
      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-base font-black text-white shrink-0 ${
        isCorrect ? 'bg-green-600' : 'bg-red-500'
      }`}>
        {isCorrect ? '✓' : '✗'}
      </span>
      <div>
        <p className={`text-sm font-bold ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
          {isCorrect ? 'Correct answer' : 'Incorrect answer'}
        </p>
        <p className="text-xs text-slate-500 flex items-center gap-1">🔒 Answer submitted and locked</p>
      </div>
    </div>
  );
}

// ─── Main exam page ───────────────────────────────────────────────────────────

export function ExamActivePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const token = getAttemptToken(id!) || '';

  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState('');
  const [title, setTitle] = useState('');
  const [questions, setQuestions] = useState<StudentQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerEntry>>({});
  const [deadline, setDeadline] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [submitConfirm, setSubmitConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Resume the attempt on load.
  useEffect(() => {
    let on = true;
    if (!token) {
      setFatal('This attempt session has expired. Please start the exam again from the link.');
      setLoading(false);
      return;
    }
    attemptsApi
      .resume(id!, token)
      .then(r => {
        if (!on) return;
        const status = r.status;
        if (status.status !== 'active' || !r.can_resume) {
          navigate(`/attempt/${id}/result`, { replace: true });
          return;
        }
        setTitle(status.exam_title || '');
        setDeadline(status.deadline_at);
        // Server-authoritative remaining time seeds the countdown so phones
        // never depend on engine-specific date parsing alone.
        setRemainingSeconds(
          typeof status.remaining_seconds === 'number' ? status.remaining_seconds : null,
        );
        setQuestions(r.questions || []);
        // Answers already stored on the server were submitted before a refresh,
        // so restore them as locked with their grading feedback.
        const map: Record<string, AnswerEntry> = {};
        (r.answers || []).forEach(a => {
          map[a.question_id] = { data: a.answer_data, submitted: true, is_correct: a.is_correct ?? null };
        });
        setAnswers(map);
        setCurrentIdx(0);
      })
      .catch(e => {
        if (on) setFatal((e as { message?: string })?.message || 'Unable to resume this attempt.');
      })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]);

  const { secondsLeft, isExpired, formatted } = useExamTimer(deadline, remainingSeconds);

  const doSubmit = useCallback(async (source: string) => {
    if (submitting) return;
    console.log('[EXAM DEBUG] SUBMIT CALLED', { source, attemptId: id });
    setSubmitting(true);
    setSaveError('');
    try {
      await attemptsApi.submit(id!, token);
      navigate(`/attempt/${id}/result`, { replace: true });
    } catch (e) {
      const msg = errMsg(e);
      // Already finalised (submitted/expired server-side) → show result.
      if (/submit|expired|active/i.test(msg)) {
        navigate(`/attempt/${id}/result`, { replace: true });
      } else {
        setSaveError(msg || 'Failed to submit. Please try again.');
        setSubmitting(false);
      }
    }
  }, [id, token, navigate, submitting]);

  // Auto-submit the whole exam only when the server-authoritative deadline
  // actually expires. Armed only once a real, positive remaining time is seen
  // (so a fresh active attempt is never submitted on load).
  const autoArmed = useRef(false);
  const autoFired = useRef(false);
  useEffect(() => {
    if (loading || !deadline) return;
    if (!isExpired) autoArmed.current = true;
  }, [loading, deadline, isExpired]);
  useEffect(() => {
    if (!autoArmed.current) return;
    if (isExpired && !autoFired.current) {
      autoFired.current = true;
      doSubmit('timer-expired');
    }
  }, [isExpired, doSubmit]);

  const currentQ = questions[currentIdx];
  const currentEntry = currentQ ? answers[currentQ.id] : undefined;
  const currentData = currentEntry?.data;
  const currentLocked = !!currentEntry?.submitted || isExpired;
  const currentDraft = !!currentEntry && !currentEntry.submitted && !isAnswerEmpty(currentEntry.data);

  const selectedOption = currentData?.type === 'multiple_choice' ? currentData.selected_option_id : null;
  const ordered = currentData?.type === 'ordering' ? currentData.token_ids : [];
  const bracketValues: string[] = (() => {
    if (currentData?.type !== 'correct_brackets') return [];
    const raw = currentData.answer;
    if (Array.isArray(raw)) return raw.map(v => String(v ?? ''));
    return raw ? [String(raw)] : [];
  })();

  const submittedCount = Object.values(answers).filter(a => a.submitted).length;
  const submittedIds = new Set(Object.entries(answers).filter(([, v]) => v.submitted).map(([qid]) => qid));
  const draftIds = new Set(Object.entries(answers).filter(([, v]) => !v.submitted && !isAnswerEmpty(v.data)).map(([qid]) => qid));

  // ── Local editing (never sent until "Submit Answer") ──────────────────────
  const editAnswer = useCallback((questionId: string, data: AnswerData | null) => {
    setAnswers(prev => {
      const existing = prev[questionId];
      if (existing?.submitted) return prev; // locked on the server; cannot change
      if (data === null) {
        // Draft cleared (e.g. deselected MCQ option) → forget it entirely.
        if (!existing) return prev;
        const next = { ...prev };
        delete next[questionId];
        return next;
      }
      return { ...prev, [questionId]: { data, submitted: false, is_correct: null } };
    });
  }, []);

  // Per-bracket values for correct-the-brackets questions. Single-bracket
  // answers are stored as a plain string, multi-bracket as a list — exactly
  // the shapes the backend validates and grades.
  const setBracketValues = useCallback((question: StudentQuestion, values: string[]) => {
    const count = question.data.brackets?.length ?? 0;
    const padded = Array.from({ length: count }, (_, i) => values[i] ?? '');
    const data: AnswerData = count === 1
      ? { type: 'correct_brackets', answer: padded[0] ?? '' }
      : { type: 'correct_brackets', answer: padded };
    editAnswer(question.id, isAnswerEmpty(data) ? null : data);
  }, [editAnswer]);

  const canSubmitCurrent = !!currentQ && !!currentEntry && !currentEntry.submitted
    && isAnswerComplete(currentEntry.data, currentQ) && !isExpired && !submittingAnswer;

  const submitCurrentAnswer = useCallback(async () => {
    if (!currentQ || !currentEntry || currentEntry.submitted) return;
    if (!isAnswerComplete(currentEntry.data, currentQ)) return;
    if (isExpired) {
      setSaveError('Time is up — no more answers can be submitted.');
      return;
    }
    setSubmittingAnswer(true);
    setSaveError('');
    try {
      const saved = await attemptsApi.saveAnswer(id!, currentQ.id, token, currentEntry.data);
      setAnswers(prev => ({
        ...prev,
        [currentQ.id]: { data: currentEntry.data, submitted: true, is_correct: saved.is_correct },
      }));
    } catch (e) {
      setSaveError(errMsg(e) || 'Failed to submit your answer. Please try again.');
    } finally {
      setSubmittingAnswer(false);
    }
  }, [currentQ, currentEntry, id, token, isExpired]);

  // ── Navigation: cannot leave while the current question has an unsubmitted
  // answer — otherwise a tap-away would silently abandon what the student
  // typed/selected. The student must Submit Answer (locks + grades it) or
  // clear the draft first. Blank questions are always skippable.
  const tryNavigate = useCallback((idx: number) => {
    if (currentQ && currentDraft) {
      setSaveError('You have an unsubmitted answer on this question. Press "Submit Answer" to save it, or clear it before moving to another question.');
      return;
    }
    setSaveError('');
    const max = questions.length - 1;
    setCurrentIdx(Math.max(0, Math.min(idx, max)));
  }, [currentQ, currentDraft, questions.length]);

  if (loading) return <LoadingSpinner className="min-h-[60vh]" />;

  if (fatal) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <Logo size="md" className="mb-4" />
        <p className="text-slate-600 text-sm mb-3">{fatal}</p>
        <button
          onClick={() => navigate('/')}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700"
        >
          Go Home
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 pb-8">
      <ExamTeacherName className="mb-2" />

      <div className="flex items-center justify-between mb-4 sticky top-0 bg-slate-50/95 backdrop-blur-sm py-2 -mx-4 px-4 border-b border-slate-200 z-10">
        <div className="flex items-center gap-3">
          <Logo size="sm" />
          <div>
            <div className="text-xs text-slate-500">{title}</div>
            <div className="text-sm font-semibold text-slate-800">Q{currentIdx + 1} / {questions.length}</div>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono font-bold text-sm ${
          secondsLeft < 60 ? 'bg-red-100 text-red-700' : secondsLeft < 300 ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-50 text-blue-700'
        }`}>
          <span>⏱</span><span>{formatted}</span>
        </div>
      </div>

      {saveError && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5" role="alert">{saveError}</div>
      )}

      {/* Progress (answered count + bar), like the reference solving UX. */}
      {questions.length > 0 && (
        <div className="mb-3">
          <div className="h-2 bg-slate-200/70 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-l from-blue-600 to-teal-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.round((submittedCount / questions.length) * 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>{submittedCount} answered</span>
            <span>{questions.length - submittedCount} remaining</span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mb-5">
        {questions.map((q, i) => {
          const isCurrent = i === currentIdx;
          const isSubmitted = submittedIds.has(q.id);
          const isDraft = draftIds.has(q.id);
          return (
            <button
              key={q.id}
              onClick={() => tryNavigate(i)}
              className={`w-9 h-9 rounded-xl text-sm font-semibold transition-all ${
                isCurrent
                  ? 'bg-blue-600 text-white shadow-sm scale-110'
                  : isSubmitted
                  ? 'bg-green-100 text-green-700 border border-green-200'
                  : isDraft
                  ? 'bg-amber-100 text-amber-700 border border-amber-200'
                  : 'bg-white text-slate-500 border border-slate-200 hover:border-blue-300'
              }`}
              aria-label={`Question ${i + 1}${isSubmitted ? ' (submitted)' : isDraft ? ' (answer not submitted)' : ' (unanswered)'}`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      {currentQ && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">
                {currentQ.type === 'multiple_choice' ? 'Multiple Choice' : currentQ.type === 'ordering' ? 'Ordering' : 'Correct the Brackets'}
              </span>
              <QuestionPrompt
                type={currentQ.type}
                text={currentQ.text}
                className="text-slate-800 font-semibold mt-1 text-base leading-snug"
                bodyClassName="text-slate-700 mt-1 text-sm leading-relaxed"
              />
            </div>
            <div className="shrink-0 ml-3">
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-lg font-medium">{currentQ.marks} mark{currentQ.marks !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {currentQ.type === 'multiple_choice' && (
            <MCQAnswer question={currentQ} selected={selectedOption} onAnswer={d => editAnswer(currentQ.id, d)} disabled={currentLocked} />
          )}
          {currentQ.type === 'ordering' && (
            <OrderingAnswer question={currentQ} arranged={ordered} onAnswer={d => editAnswer(currentQ.id, d)} disabled={currentLocked} />
          )}
          {currentQ.type === 'correct_brackets' && (
            <BracketsAnswer
              question={currentQ}
              values={bracketValues}
              onChange={vals => setBracketValues(currentQ, vals)}
              disabled={currentLocked}
            />
          )}

          <div className="mt-5 flex flex-col items-stretch gap-3">
            {currentEntry?.submitted ? (
              <FeedbackPanel isCorrect={currentEntry.is_correct} />
            ) : (
              <>
                {currentQ.type === 'ordering' && currentDraft && !canSubmitCurrent && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Place every word first — the answer needs all {currentQ.data.tokens?.length ?? 0} words before you can submit it.
                  </p>
                )}
                <button
                  type="button"
                  onClick={submitCurrentAnswer}
                  disabled={!canSubmitCurrent}
                  className="w-full px-6 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {submittingAnswer ? 'Submitting…' : 'Submit Answer'}
                </button>
                {!currentDraft && !isExpired && (
                  <p className="text-xs text-slate-400 text-center">
                    Pick or write your answer, then press Submit Answer. You can skip this question and come back to it later.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <button onClick={() => tryNavigate(currentIdx - 1)} disabled={currentIdx === 0}
          className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors">
          ← Previous
        </button>
        {currentIdx < questions.length - 1 ? (
          <button onClick={() => tryNavigate(currentIdx + 1)}
            className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
            Next →
          </button>
        ) : (
          <button onClick={() => setSubmitConfirm(true)} disabled={submitting || isExpired}
            className="px-5 py-2.5 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-60 transition-colors">
            {submitting ? 'Submitting…' : 'Submit Exam'}
          </button>
        )}
      </div>

      {/* All questions submitted → prominent finish action (reference UX). */}
      {questions.length > 0 && submittedCount === questions.length && (
        <button
          onClick={() => setSubmitConfirm(true)}
          disabled={submitting}
          className="w-full mt-4 py-3.5 bg-gradient-to-l from-blue-600 to-teal-500 text-white font-bold rounded-2xl text-base shadow-lg shadow-blue-200 disabled:opacity-60"
        >
          {submitting ? 'Submitting…' : 'Finish Exam ✓'}
        </button>
      )}

      {currentIdx < questions.length - 1 && submittedCount < questions.length && (
        <div className="mt-4 text-center">
          <button onClick={() => setSubmitConfirm(true)} disabled={submitting}
            className="text-sm text-slate-500 underline hover:text-red-600">
            Submit exam now
          </button>
        </div>
      )}

      <ConfirmDialog
        open={submitConfirm}
        title="Submit Exam"
        message={`You have submitted ${submittedCount} of ${questions.length} questions. Unsubmitted questions will be marked unanswered. Are you sure you want to submit the whole exam?`}
        confirmLabel="Submit Exam"
        cancelLabel="Continue"
        onConfirm={() => { setSubmitConfirm(false); doSubmit('manual-submit'); }}
        onCancel={() => setSubmitConfirm(false)}
      />
    </div>
  );
}
