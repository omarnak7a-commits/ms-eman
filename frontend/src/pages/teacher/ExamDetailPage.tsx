import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { examsApi } from '@/lib/api/exams';
import type {
  Exam, Question, MCQOption, OrderingToken, BracketItem, QuestionType, ExamStatus,
} from '@/types';
import { ExamStatusBadge } from '@/components/StatusBadge';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { FIXED_QUESTION_HEADERS } from '@/lib/questionPrompt';
import { copyToClipboard } from '@/lib/clipboard';

const DURATION_PRESETS = [10, 20, 30, 45, 60];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }

function errMsg(e: unknown): string {
  return (e as { message?: string })?.message || 'Something went wrong.';
}

function mcqDefaults(): Question['data'] {
  return {
    type: 'multiple_choice',
    options: [
      { id: uid(), text: '', order_index: 0, is_correct: true },
      { id: uid(), text: '', order_index: 1, is_correct: false },
      { id: uid(), text: '', order_index: 2, is_correct: false },
      { id: uid(), text: '', order_index: 3, is_correct: false },
    ],
  };
}

// ─── Question type editors ───────────────────────────────────────────────────

function MCQEditor({ question, onChange }: {
  question: Question;
  onChange: (q: Question) => void;
}) {
  if (question.data.type !== 'multiple_choice') return null;
  const options = question.data.options;

  const updateOption = (id: string, field: keyof MCQOption, value: string | boolean) => {
    let updated = options.map(o => o.id === id ? { ...o, [field]: value } : o);
    if (field === 'is_correct' && value === true) {
      updated = updated.map(o => o.id === id ? { ...o, is_correct: true } : { ...o, is_correct: false });
    }
    onChange({ ...question, data: { type: 'multiple_choice', options: updated } });
  };

  const addOption = () => {
    const newOpt: MCQOption = { id: uid(), text: '', order_index: options.length, is_correct: false };
    onChange({ ...question, data: { type: 'multiple_choice', options: [...options, newOpt] } });
  };

  const removeOption = (id: string) => {
    onChange({ ...question, data: { type: 'multiple_choice', options: options.filter(o => o.id !== id) } });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Options (select correct answer)</p>
      {options.map((opt, i) => (
        <div key={opt.id} className="flex items-center gap-2">
          <input
            type="radio"
            name={`correct-${question.id}`}
            checked={opt.is_correct}
            onChange={() => updateOption(opt.id, 'is_correct', true)}
            className="accent-blue-600"
            aria-label={`Option ${String.fromCharCode(65 + i)} is correct`}
          />
          <input
            type="text"
            value={opt.text}
            onChange={e => updateOption(opt.id, 'text', e.target.value)}
            placeholder={`Option ${String.fromCharCode(65 + i)}`}
            className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          {options.length > 2 && (
            <button onClick={() => removeOption(opt.id)} className="text-red-400 hover:text-red-600 text-sm px-1">×</button>
          )}
        </div>
      ))}
      {options.length < 6 && (
        <button onClick={addOption} className="text-xs text-blue-600 hover:text-blue-700 font-medium mt-1">
          + Add option
        </button>
      )}
    </div>
  );
}

function OrderingEditor({ question, onChange }: {
  question: Question;
  onChange: (q: Question) => void;
}) {
  if (question.data.type !== 'ordering') return null;
  const tokens = question.data.tokens || [];

  // Derive valid_orders from question.data.valid_orders or fallback to token order
  const validOrders: string[][] = (
    question.data.valid_orders && question.data.valid_orders.length > 0
      ? question.data.valid_orders
      : tokens.length > 0
      ? [tokens.map(t => t.id)]
      : []
  );

  const firstWordId = question.data.first_word_id || '';
  const [sentence, setSentence] = useState(tokens.map(t => t.text).join(' '));

  const tokenize = (s: string) => {
    const words = s.trim().split(/\s+/).filter(Boolean);
    const toks: OrderingToken[] = words.map((w, i) => ({ id: uid(), text: w, correct_position: i }));
    const defaultOrder = toks.map(t => t.id);
    onChange({
      ...question,
      data: {
        type: 'ordering',
        tokens: toks,
        valid_orders: [defaultOrder],
        first_word: toks[0]?.text || '',
        first_word_id: toks[0]?.id || '',
      },
    });
  };

  const updateToken = (id: string, text: string) => {
    const updated = tokens.map(t => t.id === id ? { ...t, text } : t);
    const currentFirst = tokens.find(t => t.id === firstWordId);
    onChange({
      ...question,
      data: {
        type: 'ordering',
        tokens: updated,
        valid_orders: validOrders,
        first_word: id === firstWordId ? text : currentFirst?.text,
        first_word_id: firstWordId,
      },
    });
  };

  const removeToken = (id: string) => {
    const updated = tokens.filter(t => t.id !== id).map((t, i) => ({ ...t, correct_position: i }));
    const updatedOrders = validOrders.map(order => order.filter(tid => tid !== id));
    const nextFirstWordId = firstWordId === id ? (updated[0]?.id || '') : firstWordId;
    const nextFirstTok = updated.find(t => t.id === nextFirstWordId);
    onChange({
      ...question,
      data: {
        type: 'ordering',
        tokens: updated,
        valid_orders: updatedOrders,
        first_word: nextFirstTok?.text,
        first_word_id: nextFirstWordId || undefined,
      },
    });
  };

  const addValidOrder = () => {
    const baseOrder = validOrders[0] || tokens.map(t => t.id);
    const nextOrders = [...validOrders, [...baseOrder]];
    onChange({
      ...question,
      data: {
        type: 'ordering',
        tokens,
        valid_orders: nextOrders,
        first_word: question.data.type === 'ordering' ? question.data.first_word : undefined,
        first_word_id: question.data.type === 'ordering' ? question.data.first_word_id : undefined,
      },
    });
  };

  const removeValidOrder = (orderIndex: number) => {
    if (validOrders.length <= 1) return;
    const nextOrders = validOrders.filter((_, i) => i !== orderIndex);
    onChange({
      ...question,
      data: {
        type: 'ordering',
        tokens,
        valid_orders: nextOrders,
        first_word: question.data.type === 'ordering' ? question.data.first_word : undefined,
        first_word_id: question.data.type === 'ordering' ? question.data.first_word_id : undefined,
      },
    });
  };

  const moveWordInOrder = (orderIndex: number, tokenPos: number, direction: -1 | 1) => {
    const targetOrder = [...validOrders[orderIndex]];
    const newPos = tokenPos + direction;
    if (newPos < 0 || newPos >= targetOrder.length) return;
    [targetOrder[tokenPos], targetOrder[newPos]] = [targetOrder[newPos], targetOrder[tokenPos]];
    const nextOrders = validOrders.map((ord, i) => (i === orderIndex ? targetOrder : ord));
    onChange({
      ...question,
      data: {
        type: 'ordering',
        tokens,
        valid_orders: nextOrders,
        first_word: question.data.type === 'ordering' ? question.data.first_word : undefined,
        first_word_id: question.data.type === 'ordering' ? question.data.first_word_id : undefined,
      },
    });
  };

  const setFirstWord = (selectedTokenId: string) => {
    const selectedTok = tokens.find(t => t.id === selectedTokenId);
    onChange({
      ...question,
      data: {
        type: 'ordering',
        tokens,
        valid_orders: validOrders,
        first_word: selectedTok?.text || undefined,
        first_word_id: selectedTokenId || undefined,
      },
    });
  };

  const tokenMap = new Map(tokens.map(t => [t.id, t]));

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">Sentence to split into words</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={sentence}
            onChange={e => setSentence(e.target.value)}
            placeholder="I went to school yesterday."
            className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            type="button"
            onClick={() => tokenize(sentence)}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 font-medium"
          >
            Tokenize
          </button>
        </div>
      </div>

      {tokens.length > 0 && (
        <>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-2">Words (edit text or remove)</p>
            <div className="flex flex-wrap gap-2">
              {tokens.map(tok => (
                <div key={tok.id} className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1">
                  <input
                    type="text"
                    value={tok.text}
                    onChange={e => updateToken(tok.id, e.target.value)}
                    className="bg-transparent text-sm text-blue-800 w-20 focus:outline-none font-medium"
                    aria-label={`Token ${tok.text}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeToken(tok.id)}
                    className="text-blue-400 hover:text-red-500 text-xs px-0.5"
                    aria-label={`Remove word ${tok.text}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* First Word Setting */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <label className="block text-xs text-slate-600 font-medium uppercase tracking-wide mb-1.5">
              First Word <span className="text-slate-400 font-normal lowercase">(visual indicator for students)</span>
            </label>
            <select
              value={firstWordId || ''}
              onChange={e => setFirstWord(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
              aria-label="Select first word"
            >
              <option value="">(None — no visual indicator)</option>
              {tokens.map((tok, i) => (
                <option key={tok.id} value={tok.id}>
                  {tok.text} (Word #{i + 1})
                </option>
              ))}
            </select>
          </div>

          {/* Valid Orders Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
                Valid Correct Orders ({validOrders.length})
              </p>
              <button
                type="button"
                onClick={addValidOrder}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                + Add another correct order
              </button>
            </div>

            <div className="space-y-3">
              {validOrders.map((order, orderIdx) => (
                <div
                  key={orderIdx}
                  className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">
                      Valid Order #{orderIdx + 1}
                      {orderIdx === 0 && <span className="text-slate-400 font-normal ml-1">(Primary)</span>}
                    </span>
                    {validOrders.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeValidOrder(orderIdx)}
                        className="text-xs text-red-500 hover:text-red-700 font-medium"
                        aria-label={`Delete valid order ${orderIdx + 1}`}
                      >
                        Delete Order
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5 items-center">
                    {order.map((tid, tokenPos) => {
                      const tok = tokenMap.get(tid);
                      if (!tok) return null;
                      return (
                        <div
                          key={`${orderIdx}-${tid}-${tokenPos}`}
                          className="flex items-center bg-white border border-slate-300 rounded-lg px-2 py-1 shadow-sm gap-1"
                        >
                          <button
                            type="button"
                            disabled={tokenPos === 0}
                            onClick={() => moveWordInOrder(orderIdx, tokenPos, -1)}
                            className="text-slate-400 hover:text-slate-700 disabled:opacity-20 text-[10px] font-bold px-0.5"
                            aria-label={`Move ${tok.text} left in order ${orderIdx + 1}`}
                          >
                            ◀
                          </button>
                          <span className="text-xs font-semibold text-slate-800 px-1">
                            {tok.text}
                          </span>
                          <button
                            type="button"
                            disabled={tokenPos === order.length - 1}
                            onClick={() => moveWordInOrder(orderIdx, tokenPos, 1)}
                            className="text-slate-400 hover:text-slate-700 disabled:opacity-20 text-[10px] font-bold px-0.5"
                            aria-label={`Move ${tok.text} right in order ${orderIdx + 1}`}
                          >
                            ▶
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BracketsEditor({ question, onChange }: {
  question: Question;
  onChange: (q: Question) => void;
}) {
  if (question.data.type !== 'correct_brackets') return null;
  const { sentence, brackets } = question.data;

  const updateSentence = (s: string) => {
    const regex = /\(([^)]+)\)/g;
    const newBrackets: BracketItem[] = [];
    let m;
    while ((m = regex.exec(s)) !== null) {
      const existing = brackets.find(b => b.original_word === m![1]);
      newBrackets.push(existing || {
        id: uid(),
        original_word: m[1],
        accepted_answers: [],
        case_sensitive: false,
      });
    }
    onChange({ ...question, data: { type: 'correct_brackets', sentence: s, brackets: newBrackets } });
  };

  const updateAccepted = (id: string, value: string) => {
    const answers = value.split(',').map(s => s.trim()).filter(Boolean);
    const updated = brackets.map(b => b.id === id ? { ...b, accepted_answers: answers } : b);
    onChange({ ...question, data: { type: 'correct_brackets', sentence, brackets: updated } });
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">Sentence with brackets</p>
        <input
          type="text"
          value={sentence}
          onChange={e => updateSentence(e.target.value)}
          placeholder="She (go) to school every day."
          className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <p className="text-xs text-slate-400 mt-1">Wrap the word to correct in parentheses, e.g. (go)</p>
      </div>
      {brackets.map(b => (
        <div key={b.id} className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-700 bg-slate-100 px-2 py-1 rounded-lg min-w-fit">({b.original_word})</span>
          <div className="flex-1">
            <input
              type="text"
              value={b.accepted_answers.join(', ')}
              onChange={e => updateAccepted(b.id, e.target.value)}
              placeholder="goes, GOES (comma-separated)"
              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <p className="text-xs text-slate-400 mt-0.5">Accepted answers (comma-separated)</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Question card ────────────────────────────────────────────────────────────

function QuestionCard({
  question, index, total, onUpdate, onDelete, onMoveUp, onMoveDown,
}: {
  question: Question;
  index: number;
  total: number;
  onUpdate: (q: Question) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const typeLabels: Record<QuestionType, string> = {
    multiple_choice: 'Multiple Choice',
    ordering: 'Ordering',
    correct_brackets: 'Correct Brackets',
  };
  const fixedHeader = FIXED_QUESTION_HEADERS[question.type];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 bg-slate-50 border-b border-slate-100">
        <div className="flex flex-col gap-0.5">
          <button onClick={onMoveUp} disabled={index === 0} className="text-slate-400 hover:text-slate-600 disabled:opacity-30 text-xs">▲</button>
          <button onClick={onMoveDown} disabled={index === total - 1} className="text-slate-400 hover:text-slate-600 disabled:opacity-30 text-xs">▼</button>
        </div>
        <span className="text-xs font-bold text-slate-500 w-5">Q{index + 1}</span>
        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">{typeLabels[question.type]}</span>
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <label className="text-xs text-slate-500">Marks:</label>
          <input
            type="number"
            min={1}
            max={10}
            value={question.marks}
            onChange={e => onUpdate({ ...question, marks: Math.max(1, parseInt(e.target.value) || 1) })}
            className="w-12 px-2 py-0.5 rounded-lg border border-slate-200 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <button onClick={() => setExpanded(v => !v)} className="text-slate-400 hover:text-slate-600 text-sm px-1">
          {expanded ? '▲' : '▼'}
        </button>
        <button onClick={onDelete} className="text-red-400 hover:text-red-600 text-sm ml-1">✕</button>
      </div>

      {expanded && (
        <div className="p-5 space-y-4">
          <div>
            {fixedHeader ? (
              <>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">Question</p>
                <p className="text-sm text-slate-800 font-semibold mb-3 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
                  {fixedHeader}
                </p>
                <label className="block text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">
                  Extra instructions (optional)
                </label>
                <textarea
                  value={question.text}
                  onChange={e => onUpdate({ ...question, text: e.target.value })}
                  rows={2}
                  placeholder="Optional extra instructions shown under the fixed header"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                />
              </>
            ) : (
              <>
                <label className="block text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">Question text</label>
                <textarea
                  value={question.text}
                  onChange={e => onUpdate({ ...question, text: e.target.value })}
                  rows={2}
                  placeholder="Enter question text..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                />
              </>
            )}
          </div>
          {question.type === 'multiple_choice' && (
            <MCQEditor question={question} onChange={onUpdate} />
          )}
          {question.type === 'ordering' && (
            <OrderingEditor question={question} onChange={onUpdate} />
          )}
          {question.type === 'correct_brackets' && (
            <BracketsEditor question={question} onChange={onUpdate} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ExamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const [exam, setExam] = useState<Partial<Exam>>(
    isNew
      ? { title: '', description: '', instructions: '', duration_minutes: 30, ranking_enabled: true, result_visibility: true, review_visibility: true }
      : {},
  );
  const [questions, setQuestions] = useState<Question[]>([]);
  const [examStatus, setExamStatus] = useState<ExamStatus>('draft');
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [publishConfirm, setPublishConfirm] = useState(false);
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  // Published/active exams stay editable: attempts pin their own snapshot
  // of the exam at start time, so editing never changes a student's
  // in-progress or past attempt. Only closed exams are locked.
  const canEdit = isNew || examStatus !== 'closed';
  const attemptCount = (exam as { attempt_count?: number }).attempt_count ?? 0;

  useEffect(() => {
    if (isNew) return;
    let on = true;
    Promise.all([examsApi.get(id!), examsApi.questions(id!)])
      .then(([e, qs]) => {
        if (!on) return;
        setExam(e);
        setExamStatus(e.status);
        setSlug(e.slug);
        setQuestions(qs);
      })
      .catch(e => { if (on) setLoadError(errMsg(e)); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [id, isNew]);

  const addQuestion = (type: QuestionType) => {
    const defaultData = type === 'multiple_choice' ? mcqDefaults()
      : type === 'ordering' ? { type: 'ordering' as const, tokens: [] as OrderingToken[], valid_orders: [] as string[][] }
      : { type: 'correct_brackets' as const, sentence: '', brackets: [] as BracketItem[] };
    const newQ: Question = {
      id: uid(),
      exam_id: '',
      type,
      text: '',
      order_index: questions.length,
      marks: 1,
      data: defaultData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setQuestions(prev => [...prev, newQ]);
  };

  const moveQuestion = (idx: number, dir: -1 | 1) => {
    const newQs = [...questions];
    const swap = idx + dir;
    if (swap < 0 || swap >= newQs.length) return;
    [newQs[idx], newQs[swap]] = [newQs[swap], newQs[idx]];
    setQuestions(newQs.map((q, i) => ({ ...q, order_index: i })));
  };

  /** Validate every present question against the backend's per-type rules. */
  const validateQuestions = (): string[] => {
    const errs: string[] = [];
    for (let n = 0; n < questions.length; n++) {
      const q = questions[n];
      const label = `Question ${n + 1}`;
      // Ordering/correct-brackets carry a fixed auto header, so a question
      // text (extra instructions) is optional for them. MCQ still requires it.
      if (!FIXED_QUESTION_HEADERS[q.type] && !q.text?.trim()) {
        errs.push(`${label}: Question text is required.`);
      }
      if (q.marks <= 0) errs.push(`${label}: Marks must be > 0.`);
      if (q.type === 'multiple_choice' && q.data.type === 'multiple_choice') {
        if (!q.data.options.some(o => o.is_correct)) errs.push(`${label}: No correct answer selected.`);
        if (q.data.options.some(o => !o.text.trim())) errs.push(`${label}: All options need text.`);
        if (q.data.options.filter(o => o.is_correct).length !== 1) errs.push(`${label}: Select exactly one correct answer.`);
      }
      if (q.type === 'ordering' && q.data.type === 'ordering') {
        if (q.data.tokens.length < 2) {
          errs.push(`${label}: Ordering requires at least 2 tokens.`);
        }
        if (q.data.tokens.some(t => !t.text.trim())) {
          errs.push(`${label}: Ordering tokens cannot be empty.`);
        }
        const validOrders = q.data.valid_orders || [q.data.tokens.map(t => t.id)];
        if (validOrders.length === 0) {
          errs.push(`${label}: Ordering requires at least one valid order.`);
        }
        const tokenIds = new Set(q.data.tokens.map(t => t.id));
        for (let i = 0; i < validOrders.length; i++) {
          const order = validOrders[i];
          if (!order || order.length !== q.data.tokens.length) {
            errs.push(`${label}: Valid order #${i + 1} must contain all ${q.data.tokens.length} words.`);
          } else {
            const orderSet = new Set(order);
            if (orderSet.size !== order.length) {
              errs.push(`${label}: Valid order #${i + 1} contains duplicate words.`);
            }
            if (!order.every(tid => tokenIds.has(tid))) {
              errs.push(`${label}: Valid order #${i + 1} contains invalid word references.`);
            }
          }
        }
      }
      if (q.type === 'correct_brackets' && q.data.type === 'correct_brackets') {
        if (!q.data.sentence.includes('(')) errs.push(`${label}: Sentence must contain bracketed word, e.g. (go).`);
        if (q.data.brackets.some(b => b.accepted_answers.length === 0)) errs.push(`${label}: Accepted answers required.`);
      }
    }
    return errs;
  };

  const validateForPublish = (): string[] => {
    const errs: string[] = [];
    if (!exam.title?.trim()) errs.push('Exam title is required.');
    if (!exam.duration_minutes || exam.duration_minutes <= 0) errs.push('Duration must be greater than 0.');
    if (questions.length === 0) errs.push('At least one question is required.');
    return errs.concat(validateQuestions());
  };

  /** Validation for Create/Save (a bare titled draft is allowed, but any present question must be valid). */
  const validateBeforeSave = (): string[] => {
    const errs: string[] = [];
    if (!exam.title?.trim()) errs.push('Exam title is required.');
    if (!exam.duration_minutes || exam.duration_minutes <= 0) errs.push('Duration must be greater than 0.');
    return errs.concat(validateQuestions());
  };

  /**
   * Persist exam details + question set with a DIFF-based sync:
   *   • questions still present → updated in place (ids stay stable),
   *   • removed questions       → deleted (the backend soft-deletes any that
   *                               already have student answers),
   *   • added questions         → created,
   *   • display order           → saved for every question.
   *
   * The old delete-everything-then-recreate approach is gone: it handed out
   * new question ids on every save and could cascade-delete answers of
   * attempts that referenced a deleted question.
   */
  const persist = useCallback(async (): Promise<{ examId: string; slugStr: string }> => {
    const fields = {
      title: exam.title,
      description: exam.description || '',
      instructions: exam.instructions || '',
      duration_minutes: exam.duration_minutes || 30,
      ranking_enabled: exam.ranking_enabled,
      result_visibility: exam.result_visibility,
      review_visibility: exam.review_visibility,
    };

    let examId: string;
    let savedSlug = slug;
    if (isNew) {
      const created = await examsApi.create(fields as Partial<Exam>);
      examId = created.id;
      savedSlug = created.slug;
    } else {
      const updated = await examsApi.update(id!, fields as Partial<Exam>);
      examId = updated.id;
      savedSlug = updated.slug;
    }

    const existing = isNew ? [] : await examsApi.questions(examId);
    const existingIds = new Set(existing.map(q => q.id));
    const keptIds = new Set(questions.filter(q => existingIds.has(q.id)).map(q => q.id));

    const syncedQs: Question[] = [];
    const finalOrder: string[] = [];
    try {
      // 1) Drop questions removed locally (safe: backend soft-deletes answered ones).
      for (const q of existing) {
        if (!keptIds.has(q.id)) await examsApi.deleteQuestion(q.id);
      }
      // 2) Update kept questions in place / create new ones.
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        // For ordering/correct-brackets the fixed header is shown automatically,
        // so if no extra instructions were entered we store the header itself as
        // the question text (the API requires a non-empty text). Display layers
        // de-duplicate it, so it is never shown twice.
        const fixedHeader = FIXED_QUESTION_HEADERS[q.type];
        const text = q.text?.trim() ? q.text : (fixedHeader ?? q.text);
        const data = q.data as unknown as Record<string, unknown>;
        if (existingIds.has(q.id)) {
          syncedQs.push(await examsApi.updateQuestion(q.id, {
            text, marks: q.marks, order_index: i, data: q.data,
          }));
          finalOrder.push(q.id);
        } else {
          const created = await examsApi.addQuestion(examId, {
            type: q.type, text, marks: q.marks, order_index: i, data,
          });
          syncedQs.push(created);
          finalOrder.push(created.id);
        }
      }
      // 3) Persist the authoritative display order.
      if (finalOrder.length > 0) await examsApi.reorderQuestions(examId, finalOrder);
    } catch (err) {
      // Keep Create atomic at the UI level: if adding questions fails on a
      // freshly-created exam, remove the partial exam so no orphan draft is
      // left behind, then surface the real error to the teacher.
      if (isNew) {
        try { await examsApi.remove(examId); } catch { /* best-effort cleanup */ }
      }
      throw err;
    }

    setSlug(savedSlug);
    if (!isNew) {
      setQuestions(syncedQs);
      const fresh = await examsApi.get(examId);
      setExamStatus(fresh.status);
      setExam(fresh);
    }
    return { examId, slugStr: savedSlug };
  }, [exam, questions, isNew, id, slug]);

  const handleSaveExam = async () => {
    if (saving) return;
    // Validate up-front so invalid input is never POSTed (and never leaves a
    // half-created exam). Mirrors the backend's per-type question rules.
    const errs = validateBeforeSave();
    if (errs.length > 0) { setErrors(errs); return; }
    setSaving(true);
    setErrors([]);
    try {
      const { examId } = await persist();
      if (isNew) {
        navigate(`/exams/${examId}`, { replace: true });
      }
    } catch (e) {
      setErrors([errMsg(e)]);
    } finally {
      setSaving(false);
    }
  };

  const confirmPublish = async () => {
    if (saving) return;
    setSaving(true);
    setErrors([]);
    try {
      const { slugStr } = await persist();
      const published = await examsApi.publish(id!);
      const url = `${window.location.origin}/exam/${slugStr || published.slug}`;
      setExamStatus(published.status);
      setSlug(published.slug);
      setShareUrl(url);
    } catch (e) {
      setErrors([errMsg(e)]);
    } finally {
      setSaving(false);
      setPublishConfirm(false);
    }
  };

  const handlePublish = () => {
    const errs = validateForPublish();
    if (errs.length > 0) { setErrors(errs); return; }
    setErrors([]);
    setPublishConfirm(true);
  };

  const confirmClose = async () => {
    try {
      await examsApi.close(id!);
      const fresh = await examsApi.get(id!);
      setExamStatus(fresh.status);
    } catch (e) {
      setErrors([errMsg(e)]);
    } finally {
      setCloseConfirm(false);
    }
  };

  if (loading) return <LoadingSpinner className="py-20" />;

  if (!isNew && loadError) {
    return <div className="p-8 text-center text-slate-500">{loadError}</div>;
  }

  const displayTitle = exam.title || 'Untitled';

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-6">
        <Link to="/exams" className="hover:text-blue-600">Exams</Link>
        <span>/</span>
        <span className="text-slate-700 font-medium">{isNew ? 'New Exam' : displayTitle}</span>
        {!isNew && <ExamStatusBadge status={examStatus} />}
      </div>

      {/* Share banner */}
      {shareUrl && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-2xl">
          <p className="text-green-800 font-semibold mb-2">Exam Published!</p>
          <p className="text-green-700 text-sm mb-3 break-all">{shareUrl}</p>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => { void copyToClipboard(shareUrl); }}
              className="px-3 py-1.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700"
            >
              Copy Link
            </button>
            {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
              <button
                onClick={() => { void navigator.share({ url: shareUrl, title: exam.title }).catch(() => copyToClipboard(shareUrl)); }}
                className="px-3 py-1.5 bg-white border border-green-300 text-green-700 rounded-xl text-sm font-medium hover:bg-green-50"
              >
                Share
              </button>
            )}
          </div>
        </div>
      )}

      {/* Share link for already published */}
      {!isNew && examStatus !== 'draft' && !shareUrl && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-2xl">
          <p className="text-blue-800 font-medium mb-1 text-sm">Student link</p>
          <p className="text-blue-700 text-sm mb-2 break-all">{window.location.origin}/exam/{slug}</p>
          <div className="flex gap-2">
            <button
              onClick={() => { void copyToClipboard(`${window.location.origin}/exam/${slug}`); }}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700"
            >
              Copy Link
            </button>
            {examStatus !== 'closed' && (
              <Link to={`/exams/${id}/results`} className="px-3 py-1.5 bg-white border border-blue-300 text-blue-700 rounded-xl text-sm hover:bg-blue-50">
                View Results
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Versioning notice: attempts pin their own exam version. */}
      {!isNew && attemptCount > 0 && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <p className="text-amber-800 font-semibold text-sm mb-1">
            {attemptCount} attempt{attemptCount !== 1 ? 's' : ''} on this exam — versioning is active
          </p>
          <p className="text-amber-700 text-xs leading-relaxed">
            Students who already started keep the exact exam version they began with
            (questions, order and correct answers). Your changes apply to students
            who start after you save.
          </p>
        </div>
      )}

      {errors.length > 0 && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl">
          <p className="text-red-700 font-medium mb-2">Please fix the following:</p>
          <ul className="text-sm text-red-600 space-y-1 list-disc list-inside">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* Exam details form */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6 space-y-4">
        <h2 className="font-semibold text-slate-800">Exam Details</h2>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
          <input
            type="text"
            value={exam.title || ''}
            onChange={e => setExam(x => ({ ...x, title: e.target.value }))}
            disabled={!canEdit}
            placeholder="e.g. English Grammar Test"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
          <textarea
            rows={2}
            value={exam.description || ''}
            onChange={e => setExam(x => ({ ...x, description: e.target.value }))}
            disabled={!canEdit}
            placeholder="Brief description of the exam"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-slate-50 resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Instructions for students</label>
          <textarea
            rows={3}
            value={exam.instructions || ''}
            onChange={e => setExam(x => ({ ...x, instructions: e.target.value }))}
            disabled={!canEdit}
            placeholder="Read each question carefully..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-slate-50 resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Duration</label>
          <div className="flex gap-2 flex-wrap">
            {DURATION_PRESETS.map(d => (
              <button
                key={d}
                onClick={() => setExam(x => ({ ...x, duration_minutes: d }))}
                disabled={!canEdit}
                className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors disabled:opacity-40 ${
                  exam.duration_minutes === d
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300'
                }`}
              >
                {d} min
              </button>
            ))}
            <input
              type="number"
              min={1}
              max={180}
              value={exam.duration_minutes || ''}
              onChange={e => setExam(x => ({ ...x, duration_minutes: parseInt(e.target.value) || 0 }))}
              disabled={!canEdit}
              placeholder="Custom"
              className="w-20 px-3 py-1.5 rounded-xl border border-slate-200 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-slate-50"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-6 pt-2">
          {([
            ['ranking_enabled', 'Enable ranking / leaderboard'],
            ['result_visibility', 'Show results to students'],
            ['review_visibility', 'Allow answer review after submission'],
          ] as [keyof Exam, string][]).map(([field, label]) => (
            <label key={field} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!exam[field]}
                onChange={e => setExam(x => ({ ...x, [field]: e.target.checked }))}
                disabled={!canEdit}
                className="w-4 h-4 accent-blue-600"
              />
              <span className="text-sm text-slate-700">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Questions */}
      {questions.length > 0 && (
        <div className="mb-6">
          <h2 className="font-semibold text-slate-800 mb-3">Questions ({questions.length})</h2>
          <div className="space-y-4">
            {questions.map((q, i) => (
              <QuestionCard
                key={q.id}
                question={q}
                index={i}
                total={questions.length}
                onUpdate={updated => setQuestions(qs => qs.map(x => x.id === q.id ? updated : x))}
                onDelete={() => setQuestions(qs => qs.filter(x => x.id !== q.id).map((x, i) => ({ ...x, order_index: i })))}
                onMoveUp={() => moveQuestion(i, -1)}
                onMoveDown={() => moveQuestion(i, 1)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Add question buttons */}
      {canEdit && (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-5 mb-6">
          <p className="text-sm font-medium text-slate-600 mb-3">Add a question</p>
          <div className="flex gap-2 flex-wrap">
            {(['multiple_choice', 'ordering', 'correct_brackets'] as QuestionType[]).map(type => (
              <button
                key={type}
                onClick={() => addQuestion(type)}
                className="px-4 py-2 rounded-xl border border-blue-200 text-blue-700 text-sm font-medium hover:bg-blue-50 transition-colors"
              >
                {type === 'multiple_choice' ? '+ Multiple Choice' : type === 'ordering' ? '+ Ordering' : '+ Correct Brackets'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 flex-wrap">
        {canEdit && (
          <button
            onClick={handleSaveExam}
            disabled={saving}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {saving ? 'Saving…' : isNew ? 'Create Exam' : 'Save Changes'}
          </button>
        )}
        {!isNew && canEdit && questions.length > 0 && (
          <button
            onClick={handlePublish}
            className="px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors"
          >
            Publish Exam
          </button>
        )}
        {!isNew && (
          <Link
            to={`/exams/${id}/preview`}
            className="px-5 py-2.5 border border-blue-200 text-blue-700 rounded-xl text-sm font-medium hover:bg-blue-50 transition-colors"
          >
            Preview Exam
          </Link>
        )}
        {!isNew && examStatus === 'published' && (
          <button
            onClick={() => setCloseConfirm(true)}
            className="px-5 py-2.5 bg-slate-700 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"
          >
            Close Exam
          </button>
        )}
        <Link to="/exams" className="px-5 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">
          Back to Exams
        </Link>
      </div>

      <ConfirmDialog
        open={publishConfirm}
        title="Publish Exam"
        message={
          attemptCount > 0
            ? 'Students already in an attempt keep their current exam version. New students will see the updated exam. Publish now?'
            : 'This will make the exam available to students. Are you ready to publish?'
        }
        confirmLabel="Publish"
        onConfirm={confirmPublish}
        onCancel={() => setPublishConfirm(false)}
      />
      <ConfirmDialog
        open={closeConfirm}
        title="Close Exam"
        message="Closing the exam will prevent new students from starting it. Existing attempts are not affected."
        confirmLabel="Close Exam"
        danger
        onConfirm={confirmClose}
        onCancel={() => setCloseConfirm(false)}
      />
    </div>
  );
}
