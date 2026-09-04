import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getSession } from '@/lib/auth';
import {
  getExamById, createExam, updateExam, publishExam, closeExam,
  getQuestionsByExam, createQuestion, updateQuestion, deleteQuestion, reorderQuestions,
} from '@/lib/db';
import type { Exam, Question, MCQOption, OrderingToken, BracketItem, QuestionType } from '@/types';
import { ExamStatusBadge } from '@/components/StatusBadge';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const DURATION_PRESETS = [10, 20, 30, 45, 60];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 10); }

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
  const tokens = question.data.tokens;
  const [sentence, setSentence] = useState(tokens.map(t => t.text).join(' '));

  const tokenize = (s: string) => {
    const words = s.trim().split(/\s+/).filter(Boolean);
    const toks: OrderingToken[] = words.map((w, i) => ({ id: uid(), text: w, correct_position: i }));
    onChange({ ...question, data: { type: 'ordering', tokens: toks } });
  };

  const updateToken = (id: string, text: string) => {
    const updated = tokens.map(t => t.id === id ? { ...t, text } : t);
    onChange({ ...question, data: { type: 'ordering', tokens: updated } });
  };

  const removeToken = (id: string) => {
    const updated = tokens.filter(t => t.id !== id).map((t, i) => ({ ...t, correct_position: i }));
    onChange({ ...question, data: { type: 'ordering', tokens: updated } });
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">Correct sentence</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={sentence}
            onChange={e => setSentence(e.target.value)}
            placeholder="Ahmed goes to school every day."
            className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={() => tokenize(sentence)}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            Tokenize
          </button>
        </div>
      </div>
      {tokens.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-2">Tokens (edit if needed)</p>
          <div className="flex flex-wrap gap-2">
            {tokens.map(tok => (
              <div key={tok.id} className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1">
                <input
                  type="text"
                  value={tok.text}
                  onChange={e => updateToken(tok.id, e.target.value)}
                  className="bg-transparent text-sm text-blue-800 w-16 focus:outline-none"
                />
                <button onClick={() => removeToken(tok.id)} className="text-blue-400 hover:text-red-500 text-xs">×</button>
              </div>
            ))}
          </div>
        </div>
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
  question, index, total, onUpdate, onDelete, onMoveUp, onMoveDown
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
            <label className="block text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">Question text</label>
            <textarea
              value={question.text}
              onChange={e => onUpdate({ ...question, text: e.target.value })}
              rows={2}
              placeholder="Enter question text..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />
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
  const teacher = getSession()!;
  const isNew = id === 'new';

  const [exam, setExam] = useState<Partial<Exam>>(() =>
    isNew ? { title: '', description: '', instructions: '', duration_minutes: 30, ranking_enabled: true, result_visibility: true, review_visibility: true }
    : getExamById(id!) || {}
  );
  const [questions, setQuestions] = useState<Question[]>(() =>
    isNew ? [] : getQuestionsByExam(id!)
  );
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [publishConfirm, setPublishConfirm] = useState(false);
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  const examObj = isNew ? null : getExamById(id!);
  const examStatus = examObj?.status || 'draft';
  const canEdit = examStatus === 'draft';

  const refresh = useCallback(() => {
    if (!isNew) {
      setQuestions(getQuestionsByExam(id!));
    }
  }, [id, isNew]);

  const handleSaveExam = () => {
    setSaving(true);
    try {
      if (isNew) {
        const created = createExam(teacher.id, exam);
        navigate(`/exams/${created.id}`, { replace: true });
      } else {
        updateExam(id!, exam);
        // save questions
        const existing = getQuestionsByExam(id!);
        for (const q of questions) {
          const found = existing.find(e => e.id === q.id);
          if (found) updateQuestion(q.id, q);
          else createQuestion(id!, q);
        }
        // delete removed
        for (const eq of existing) {
          if (!questions.find(q => q.id === eq.id)) deleteQuestion(eq.id);
        }
        const orderedIds = questions.map(q => q.id);
        reorderQuestions(id!, orderedIds);
        refresh();
      }
    } finally {
      setSaving(false);
    }
  };

  const addQuestion = (type: QuestionType) => {
    const defaultData = type === 'multiple_choice'
      ? { type: 'multiple_choice' as const, options: [
          { id: uid(), text: '', order_index: 0, is_correct: true },
          { id: uid(), text: '', order_index: 1, is_correct: false },
          { id: uid(), text: '', order_index: 2, is_correct: false },
          { id: uid(), text: '', order_index: 3, is_correct: false },
        ]}
      : type === 'ordering'
      ? { type: 'ordering' as const, tokens: [] }
      : { type: 'correct_brackets' as const, sentence: '', brackets: [] };

    const newQ: Question = {
      id: uid(),
      exam_id: id || 'new',
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

  const validateForPublish = (): string[] => {
    const errs: string[] = [];
    if (!exam.title?.trim()) errs.push('Exam title is required.');
    if (!exam.duration_minutes || exam.duration_minutes <= 0) errs.push('Duration must be greater than 0.');
    if (questions.length === 0) errs.push('At least one question is required.');
    for (const q of questions) {
      if (!q.text?.trim()) errs.push(`Question ${questions.indexOf(q) + 1}: Question text is required.`);
      if (q.marks <= 0) errs.push(`Question ${questions.indexOf(q) + 1}: Marks must be > 0.`);
      if (q.type === 'multiple_choice' && q.data.type === 'multiple_choice') {
        if (!q.data.options.some(o => o.is_correct)) errs.push(`Question ${questions.indexOf(q) + 1}: No correct answer selected.`);
        if (q.data.options.some(o => !o.text.trim())) errs.push(`Question ${questions.indexOf(q) + 1}: All options need text.`);
      }
      if (q.type === 'ordering' && q.data.type === 'ordering' && q.data.tokens.length < 2) {
        errs.push(`Question ${questions.indexOf(q) + 1}: Ordering requires at least 2 tokens.`);
      }
      if (q.type === 'correct_brackets' && q.data.type === 'correct_brackets') {
        if (!q.data.sentence.includes('(')) errs.push(`Question ${questions.indexOf(q) + 1}: Sentence must contain bracketed word, e.g. (go).`);
        if (q.data.brackets.some(b => b.accepted_answers.length === 0)) errs.push(`Question ${questions.indexOf(q) + 1}: Accepted answers required.`);
      }
    }
    return errs;
  };

  const handlePublish = () => {
    const errs = validateForPublish();
    if (errs.length > 0) { setErrors(errs); return; }
    setErrors([]);
    setPublishConfirm(true);
  };

  const confirmPublish = () => {
    handleSaveExam();
    if (!isNew) {
      const updated = publishExam(id!);
      if (updated) {
        const url = `${window.location.origin}/exam/${updated.slug}`;
        setShareUrl(url);
      }
    }
    setPublishConfirm(false);
  };

  const confirmClose = () => {
    closeExam(id!);
    setCloseConfirm(false);
    window.location.reload();
  };

  const moveQuestion = (idx: number, dir: -1 | 1) => {
    const newQs = [...questions];
    const swap = idx + dir;
    if (swap < 0 || swap >= newQs.length) return;
    [newQs[idx], newQs[swap]] = [newQs[swap], newQs[idx]];
    setQuestions(newQs.map((q, i) => ({ ...q, order_index: i })));
  };

  const currentExam = !isNew ? getExamById(id!) : null;
  const slug = currentExam?.slug || '';

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-6">
        <Link to="/exams" className="hover:text-blue-600">Exams</Link>
        <span>/</span>
        <span className="text-slate-700 font-medium">{isNew ? 'New Exam' : (exam.title || 'Untitled')}</span>
        {!isNew && <ExamStatusBadge status={examStatus} />}
      </div>

      {/* Share banner */}
      {shareUrl && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-2xl">
          <p className="text-green-800 font-semibold mb-2">Exam Published!</p>
          <p className="text-green-700 text-sm mb-3 break-all">{shareUrl}</p>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => { navigator.clipboard.writeText(shareUrl); }}
              className="px-3 py-1.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700"
            >
              Copy Link
            </button>
            {navigator.share && (
              <button
                onClick={() => navigator.share({ url: shareUrl, title: exam.title })}
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
              onClick={() => navigator.clipboard.writeText(`${window.location.origin}/exam/${slug}`)}
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

      {errors.length > 0 && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl">
          <p className="text-red-700 font-medium mb-2">Please fix the following before publishing:</p>
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
            disabled={!canEdit && !isNew}
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
            disabled={!canEdit && !isNew}
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
            disabled={!canEdit && !isNew}
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
                disabled={!canEdit && !isNew}
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
              disabled={!canEdit && !isNew}
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
                disabled={!canEdit && !isNew}
                className="w-4 h-4 accent-blue-600"
              />
              <span className="text-sm text-slate-700">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Questions */}
      {(!isNew || questions.length > 0) && (
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
      {(canEdit || isNew) && (
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
        {(canEdit || isNew) && (
          <button
            onClick={handleSaveExam}
            disabled={saving}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {saving ? 'Saving…' : isNew ? 'Create Exam' : 'Save Changes'}
          </button>
        )}
        {!isNew && canEdit && (
          <button
            onClick={handlePublish}
            className="px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors"
          >
            Publish Exam
          </button>
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
        message="This will make the exam available to students. Are you ready to publish?"
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
