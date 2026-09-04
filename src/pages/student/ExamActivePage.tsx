import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { attemptsApi, getAttemptToken, type StudentQuestion } from '@/lib/api/attempts';
import { useExamTimer } from '@/hooks/useExamTimer';
import { Logo } from '@/components/Logo';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import type { AnswerData } from '@/types';

interface LiveAnswer {
  data: AnswerData;
  is_correct: boolean | null;
}

// ─── MCQ answer ───────────────────────────────────────────────────────────────

function MCQAnswer({ question, selected, onAnswer, disabled }: {
  question: StudentQuestion;
  selected: string | null;
  onAnswer: (data: AnswerData) => void;
  disabled: boolean;
}) {
  if (!question.data.options) return null;
  return (
    <div className="space-y-3">
      {question.data.options.map((opt, i) => (
        <button
          key={opt.id}
          onClick={() => !disabled && onAnswer({ type: 'multiple_choice', selected_option_id: opt.id })}
          disabled={disabled}
          className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 text-left transition-all ${
            selected === opt.id
              ? 'border-blue-500 bg-blue-50 text-blue-800'
              : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50'
          } disabled:cursor-default`}
        >
          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
            selected === opt.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
          }`}>
            {String.fromCharCode(65 + i)}
          </span>
          <span className="text-sm font-medium">{opt.text}</span>
        </button>
      ))}
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
                className={`px-3 py-2 rounded-xl border-2 text-sm font-medium min-w-12 transition-all ${
                  token
                    ? 'border-blue-400 bg-blue-50 text-blue-800 hover:border-red-400 hover:bg-red-50 hover:text-red-700'
                    : 'border-dashed border-slate-300 text-slate-300'
                }`}
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

      {!disabled && (
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

function BracketsAnswer({ question, value, onAnswer, disabled }: {
  question: StudentQuestion;
  value: string;
  onAnswer: (data: AnswerData) => void;
  disabled: boolean;
}) {
  const parts = (question.data.sentence || '').split(/(\([^)]+\))/g);
  return (
    <div>
      <div className="mb-4 p-4 bg-slate-50 rounded-xl text-sm text-slate-800 leading-relaxed">
        {parts.map((part, i) => {
          if (/^\([^)]+\)$/.test(part)) {
            return <span key={i} className="font-semibold text-blue-700 bg-blue-100 px-1 rounded">{part}</span>;
          }
          return <span key={i}>{part}</span>;
        })}
      </div>
      <input
        type="text"
        value={value}
        onChange={e => onAnswer({ type: 'correct_brackets', answer: e.target.value })}
        disabled={disabled}
        placeholder="Type the correct word…"
        dir="auto"
        className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-sm focus:outline-none focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-400 transition-colors"
      />
    </div>
  );
}

// ─── Feedback badge ────────────────────────────────────────────────────────────

function FeedbackBadge({ isCorrect }: { isCorrect: boolean | null }) {
  if (isCorrect === null) return null;
  return (
    <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold ${
      isCorrect ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
    }`}>
      <span>{isCorrect ? '✓' : '✗'}</span>
      <span>{isCorrect ? 'Correct' : 'Incorrect'}</span>
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
  const [answers, setAnswers] = useState<Record<string, LiveAnswer>>({});
  const [deadline, setDeadline] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [submitConfirm, setSubmitConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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
        setQuestions(r.questions || []);
        const map: Record<string, LiveAnswer> = {};
        (r.answers || []).forEach(a => {
          if (a.answer_data) map[a.question_id] = { data: a.answer_data, is_correct: null };
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

  const { secondsLeft, isExpired, formatted } = useExamTimer(deadline);

  const doSubmit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setSaveError('');
    try {
      await attemptsApi.submit(id!, token);
      navigate(`/attempt/${id}/result`, { replace: true });
    } catch (e) {
      const msg = (e as { message?: string })?.message || '';
      // Already finalised (submitted/expired server-side) → show result.
      if (/submit|expired|active/i.test(msg)) {
        navigate(`/attempt/${id}/result`, { replace: true });
      } else {
        setSaveError(msg || 'Failed to submit. Please try again.');
        setSubmitting(false);
      }
    }
  }, [id, token, navigate, submitting]);

  // Auto-submit when the server deadline is reached.
  const autoFired = useRef(false);
  useEffect(() => {
    if (isExpired && !autoFired.current) {
      autoFired.current = true;
      doSubmit();
    }
  }, [isExpired, doSubmit]);

  const handleAnswer = useCallback(async (questionId: string, data: AnswerData) => {
    setAnswers(prev => ({ ...prev, [questionId]: { data, is_correct: null } }));
    try {
      const saved = await attemptsApi.saveAnswer(id!, questionId, token, data);
      setAnswers(prev => ({ ...prev, [questionId]: { data, is_correct: saved.is_correct } }));
    } catch (e) {
      setSaveError((e as { message?: string })?.message || 'Failed to save your answer.');
    }
  }, [id, token]);

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

  const currentQ = questions[currentIdx];
  const answeredIds = new Set(Object.keys(answers));
  const currentData = currentQ ? answers[currentQ.id]?.data : undefined;
  const selectedOption =
    currentData?.type === 'multiple_choice' ? currentData.selected_option_id : null;
  const ordered = currentData?.type === 'ordering' ? currentData.token_ids : [];
  const bracketValue = currentData?.type === 'correct_brackets' ? currentData.answer : '';

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 pb-8">
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
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5">{saveError}</div>
      )}

      <div className="flex flex-wrap gap-1.5 mb-5">
        {questions.map((q, i) => (
          <button
            key={q.id}
            onClick={() => setCurrentIdx(i)}
            className={`w-9 h-9 rounded-xl text-sm font-semibold transition-all ${
              i === currentIdx
                ? 'bg-blue-600 text-white shadow-sm scale-110'
                : answeredIds.has(q.id)
                ? 'bg-green-100 text-green-700 border border-green-200'
                : 'bg-white text-slate-500 border border-slate-200 hover:border-blue-300'
            }`}
            aria-label={`Question ${i + 1}${answeredIds.has(q.id) ? ' (answered)' : ' (unanswered)'}`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {currentQ && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">
                {currentQ.type === 'multiple_choice' ? 'Multiple Choice' : currentQ.type === 'ordering' ? 'Ordering' : 'Correct the Brackets'}
              </span>
              <p className="text-slate-800 font-semibold mt-1 text-base leading-snug">{currentQ.text}</p>
            </div>
            <div className="shrink-0 ml-3">
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-lg font-medium">{currentQ.marks} mark{currentQ.marks !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {currentQ.type === 'multiple_choice' && (
            <MCQAnswer question={currentQ} selected={selectedOption} onAnswer={d => handleAnswer(currentQ.id, d)} disabled={isExpired} />
          )}
          {currentQ.type === 'ordering' && (
            <OrderingAnswer question={currentQ} arranged={ordered} onAnswer={d => handleAnswer(currentQ.id, d)} disabled={isExpired} />
          )}
          {currentQ.type === 'correct_brackets' && (
            <BracketsAnswer question={currentQ} value={bracketValue} onAnswer={d => handleAnswer(currentQ.id, d)} disabled={isExpired} />
          )}

          {answers[currentQ.id]?.is_correct !== undefined && (
            <div className="mt-4"><FeedbackBadge isCorrect={answers[currentQ.id]?.is_correct ?? null} /></div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <button onClick={() => setCurrentIdx(i => Math.max(0, i - 1))} disabled={currentIdx === 0}
          className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors">
          ← Previous
        </button>
        {currentIdx < questions.length - 1 ? (
          <button onClick={() => setCurrentIdx(i => i + 1)}
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

      {currentIdx < questions.length - 1 && (
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
        message={`You have answered ${answeredIds.size} of ${questions.length} questions. Are you sure you want to submit? You cannot change your answers after submission.`}
        confirmLabel="Submit Exam"
        cancelLabel="Continue"
        onConfirm={() => { setSubmitConfirm(false); doSubmit(); }}
        onCancel={() => setSubmitConfirm(false)}
      />
    </div>
  );
}
