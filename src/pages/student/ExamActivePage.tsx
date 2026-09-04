import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getAttemptById, getExamById, getQuestionsByExam,
  getAnswersByAttempt, saveAnswer,
} from '@/lib/db';
import { gradeAttempt, gradeAnswer } from '@/lib/grading';
import { useExamTimer } from '@/hooks/useExamTimer';
import { Logo } from '@/components/Logo';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { Question, Answer, AnswerData, OrderingToken } from '@/types';

// ─── MCQ answer ───────────────────────────────────────────────────────────────

function MCQAnswer({ question, answer, onAnswer, disabled }: {
  question: Question;
  answer: Answer | undefined;
  onAnswer: (data: AnswerData) => void;
  disabled: boolean;
}) {
  if (question.data.type !== 'multiple_choice') return null;
  const selected = answer?.answer_data.type === 'multiple_choice' ? answer.answer_data.selected_option_id : null;

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

function OrderingAnswer({ question, answer, onAnswer, disabled }: {
  question: Question;
  answer: Answer | undefined;
  onAnswer: (data: AnswerData) => void;
  disabled: boolean;
}) {
  if (question.data.type !== 'ordering') return null;
  const tokens = question.data.tokens;

  // Shuffle tokens once using seeded order based on token ids
  const shuffled = useRef<OrderingToken[]>([]);
  if (shuffled.current.length === 0) {
    shuffled.current = [...tokens].sort((a, b) => {
      const ha = parseInt(a.id.slice(-4), 36) || 0;
      const hb = parseInt(b.id.slice(-4), 36) || 0;
      return ha - hb;
    });
  }

  const existing = answer?.answer_data.type === 'ordering' ? answer.answer_data.token_ids : [];
  const [arranged, setArranged] = useState<string[]>(existing);

  const usedIds = new Set(arranged);
  const available = shuffled.current.filter(t => !usedIds.has(t.id));

  const tapToken = (id: string) => {
    if (disabled) return;
    const next = [...arranged, id];
    setArranged(next);
    onAnswer({ type: 'ordering', token_ids: next });
  };

  const removeFromSlot = (idx: number) => {
    if (disabled) return;
    const next = arranged.filter((_, i) => i !== idx);
    setArranged(next);
    onAnswer({ type: 'ordering', token_ids: next });
  };

  const handleUndo = () => {
    if (disabled || arranged.length === 0) return;
    const next = arranged.slice(0, -1);
    setArranged(next);
    onAnswer({ type: 'ordering', token_ids: next });
  };

  const handleClear = () => {
    if (disabled) return;
    setArranged([]);
    onAnswer({ type: 'ordering', token_ids: [] });
  };

  return (
    <div>
      {/* Answer slots */}
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

      {/* Available tokens */}
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
          <button
            onClick={handleUndo}
            disabled={arranged.length === 0}
            className="px-3 py-1.5 rounded-xl text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            Undo
          </button>
          <button
            onClick={handleClear}
            disabled={arranged.length === 0}
            className="px-3 py-1.5 rounded-xl text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Correct Brackets answer ──────────────────────────────────────────────────

function BracketsAnswer({ question, answer, onAnswer, disabled }: {
  question: Question;
  answer: Answer | undefined;
  onAnswer: (data: AnswerData) => void;
  disabled: boolean;
}) {
  if (question.data.type !== 'correct_brackets') return null;
  const existing = answer?.answer_data.type === 'correct_brackets' ? answer.answer_data.answer : '';
  const [value, setValue] = useState(existing);

  const handleChange = (v: string) => {
    setValue(v);
    onAnswer({ type: 'correct_brackets', answer: v });
  };

  const parts = question.data.sentence.split(/(\([^)]+\))/g);

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
        onChange={e => handleChange(e.target.value)}
        disabled={disabled}
        placeholder="Type the correct word…"
        dir="auto"
        className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-sm focus:outline-none focus:ring-0 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-400 transition-colors"
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

  const attempt = getAttemptById(id!);
  const exam = attempt ? getExamById(attempt.exam_id) : null;
  const questions = exam ? getQuestionsByExam(exam.id) : [];
  const [answers, setAnswers] = useState<Answer[]>(() => attempt ? getAnswersByAttempt(attempt.id) : []);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [feedbacks, setFeedbacks] = useState<Record<string, boolean | null>>({});
  const [submitConfirm, setSubmitConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { secondsLeft, isExpired, formatted } = useExamTimer(attempt?.deadline_at || null);

  const hasAutoSubmitted = useRef(false);

  const doSubmit = useCallback(() => {
    if (hasAutoSubmitted.current) return;
    hasAutoSubmitted.current = true;
    setSubmitting(true);
    gradeAttempt(id!);
    navigate(`/attempt/${id}/result`);
  }, [id, navigate]);

  useEffect(() => {
    if (isExpired && attempt?.status === 'active') doSubmit();
  }, [isExpired, attempt?.status, doSubmit]);

  if (!attempt || !exam || attempt.status !== 'active') {
    if (attempt?.status === 'submitted') {
      navigate(`/attempt/${id}/result`);
      return null;
    }
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <Logo size="md" className="mb-4" />
        <p className="text-slate-500">This attempt is no longer available.</p>
      </div>
    );
  }

  const currentQ = questions[currentIdx];
  const currentAnswer = answers.find(a => a.question_id === currentQ?.id);
  const answeredIds = new Set(answers.filter(a => a.answer_data).map(a => a.question_id));

  const handleAnswer = (data: AnswerData) => {
    const saved = saveAnswer(attempt.id, currentQ.id, data);
    setAnswers(getAnswersByAttempt(attempt.id));

    // Immediate feedback
    const result = gradeAnswer(currentQ, data);
    setFeedbacks(prev => ({ ...prev, [currentQ.id]: result.is_correct }));
  };

  const handleSubmitConfirm = () => {
    setSubmitConfirm(false);
    doSubmit();
  };

  const isExpiredState = isExpired;

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 sticky top-0 bg-slate-50/95 backdrop-blur-sm py-2 -mx-4 px-4 border-b border-slate-200 z-10">
        <div className="flex items-center gap-3">
          <Logo size="sm" />
          <div>
            <div className="text-xs text-slate-500">{exam.title}</div>
            <div className="text-sm font-semibold text-slate-800">
              Q{currentIdx + 1} / {questions.length}
            </div>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono font-bold text-sm ${
          secondsLeft < 60 ? 'bg-red-100 text-red-700' :
          secondsLeft < 300 ? 'bg-yellow-100 text-yellow-700' :
          'bg-blue-50 text-blue-700'
        }`}>
          <span>⏱</span>
          <span>{formatted}</span>
        </div>
      </div>

      {/* Question navigator */}
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

      {/* Question */}
      {currentQ && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">
                {currentQ.type === 'multiple_choice' ? 'Multiple Choice' :
                 currentQ.type === 'ordering' ? 'Ordering' : 'Correct the Brackets'}
              </span>
              <p className="text-slate-800 font-semibold mt-1 text-base leading-snug">{currentQ.text}</p>
            </div>
            <div className="shrink-0 ml-3">
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-lg font-medium">{currentQ.marks} mark{currentQ.marks !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {currentQ.type === 'multiple_choice' && (
            <MCQAnswer question={currentQ} answer={currentAnswer} onAnswer={handleAnswer} disabled={isExpiredState} />
          )}
          {currentQ.type === 'ordering' && (
            <OrderingAnswer question={currentQ} answer={currentAnswer} onAnswer={handleAnswer} disabled={isExpiredState} />
          )}
          {currentQ.type === 'correct_brackets' && (
            <BracketsAnswer question={currentQ} answer={currentAnswer} onAnswer={handleAnswer} disabled={isExpiredState} />
          )}

          {feedbacks[currentQ.id] !== undefined && (
            <div className="mt-4">
              <FeedbackBadge isCorrect={feedbacks[currentQ.id] ?? null} />
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
          disabled={currentIdx === 0}
          className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
        >
          ← Previous
        </button>

        {currentIdx < questions.length - 1 ? (
          <button
            onClick={() => setCurrentIdx(i => i + 1)}
            className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Next →
          </button>
        ) : (
          <button
            onClick={() => setSubmitConfirm(true)}
            disabled={submitting || isExpiredState}
            className="px-5 py-2.5 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-60 transition-colors"
          >
            {submitting ? 'Submitting…' : 'Submit Exam'}
          </button>
        )}
      </div>

      {/* Submit from anywhere */}
      {currentIdx < questions.length - 1 && (
        <div className="mt-4 text-center">
          <button
            onClick={() => setSubmitConfirm(true)}
            disabled={submitting}
            className="text-sm text-slate-500 underline hover:text-red-600"
          >
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
        onConfirm={handleSubmitConfirm}
        onCancel={() => setSubmitConfirm(false)}
      />
    </div>
  );
}
