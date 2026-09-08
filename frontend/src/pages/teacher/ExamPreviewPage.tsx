import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { examsApi } from '@/lib/api/exams';
import { QuestionPrompt } from '@/components/QuestionPrompt';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ExamStatusBadge } from '@/components/StatusBadge';

type PreviewData = Awaited<ReturnType<typeof examsApi.preview>>;
type PreviewQuestion = PreviewData['questions'][number];

const TYPE_LABELS: Record<string, string> = {
  multiple_choice: 'Multiple Choice',
  ordering: 'Ordering',
  correct_brackets: 'Correct the Brackets',
};

// ─── Read-only renderers: exactly what the student sees (no answers) ────────

function PreviewMCQ({ q }: { q: PreviewQuestion }) {
  return (
    <div className="space-y-3">
      {(q.data.options || []).map((opt, i) => (
        <div
          key={opt.id}
          className="flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-slate-200 bg-white"
        >
          <span className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 bg-slate-100 text-slate-600">
            {String.fromCharCode(65 + i)}
          </span>
          <span className="text-sm font-medium text-slate-700">{opt.text}</span>
        </div>
      ))}
    </div>
  );
}

function PreviewOrdering({ q }: { q: PreviewQuestion }) {
  const tokens = q.data.tokens || [];
  const firstWordId = q.data.first_word_id;
  const firstWordText = q.data.first_word;
  const firstToken = tokens.find(t => (firstWordId && t.id === firstWordId) || (firstWordText && t.text === firstWordText));

  return (
    <div>
      <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-2">Your answer</p>
      <div className="flex flex-wrap gap-2">
        {tokens.map((tok, i) => (
          <span
            key={tok.id}
            className="px-3 py-2 rounded-xl border-2 border-dashed border-slate-300 text-sm font-medium text-slate-400 min-w-12 text-center"
          >
            <span className="text-xs">{i + 1}</span>
          </span>
        ))}
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Available words</p>
          {firstToken && (
            <span className="text-xs text-blue-600 font-medium flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
              First word: <strong className="font-semibold text-blue-800">{firstToken.text}</strong>
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {tokens.map(tok => {
            const isFirstWord = firstToken && tok.id === firstToken.id;
            return (
              <span
                key={tok.id}
                className={`px-3 py-1.5 rounded-xl border-2 text-sm font-medium flex items-center gap-1.5 ${
                  isFirstWord
                    ? 'bg-blue-50 border-blue-400 text-blue-900 shadow-sm font-semibold'
                    : 'bg-white border-slate-200 text-slate-700'
                }`}
              >
                <span>{tok.text}</span>
                {isFirstWord && (
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-600 text-white px-1.5 py-0.5 rounded-md">
                    First
                  </span>
                )}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const BRACKET_SPLIT = /(\([^)]+\))/g;
const BRACKET_TEST = /^\([^)]+\)$/;

function PreviewBrackets({ q }: { q: PreviewQuestion }) {
  const parts = (q.data.sentence || '').split(BRACKET_SPLIT);
  const brackets = q.data.brackets || [];
  return (
    <div>
      <p
        data-testid="preview-brackets-sentence"
        dir="auto"
        className="mb-4 px-4 py-3.5 bg-slate-50 border border-slate-100 rounded-xl text-base text-slate-800 leading-relaxed"
      >
        {parts.map((part, i) =>
          BRACKET_TEST.test(part) ? (
            <strong key={i} className="font-bold text-blue-700">{part}</strong>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </p>
      <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-2">
        {brackets.length > 1 ? 'Your answers' : 'Your answer'}
      </p>
      <div className="space-y-3">
        {brackets.map(b => (
          <div key={b.id}>
            {brackets.length > 1 && (
              <p className="text-xs font-semibold text-slate-500 mb-1" dir="auto">
                Correction of <span className="text-blue-700">({b.original_word})</span>
              </p>
            )}
            <input
              type="text"
              disabled
              placeholder="Type the correction…"
              className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-sm text-slate-800 disabled:bg-slate-50"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function ExamPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let on = true;
    examsApi
      .preview(id!)
      .then(p => { if (on) setData(p); })
      .catch(e => { if (on) setError((e as { message?: string })?.message || 'Preview not available.'); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <LoadingSpinner className="py-20" />;

  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-slate-500 mb-4">{error || 'Preview not available.'}</p>
        <Link to={`/exams/${id}`} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
          Back to Editor
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
        <Link to="/exams" className="hover:text-blue-600">Exams</Link>
        <span>/</span>
        <Link to={`/exams/${id}`} className="hover:text-blue-600">{data.title || 'Untitled'}</Link>
        <span>/</span>
        <span className="text-slate-700 font-medium">Preview</span>
      </div>

      {/* Preview banner — this must never be mistaken for a real attempt. */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-2xl flex items-start gap-3">
        <span className="text-lg leading-none mt-0.5" aria-hidden="true">👁</span>
        <div>
          <p className="text-blue-800 font-semibold text-sm">Teacher preview — exactly what students see</p>
          <p className="text-blue-700 text-xs mt-0.5">
            No student attempt is created by previewing. Correct answers are never shown here.
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-slate-800">{data.title}</h1>
          <ExamStatusBadge status={data.status as 'draft' | 'published' | 'active' | 'closed'} />
        </div>
        {data.description && <p className="text-sm text-slate-500 mt-1">{data.description}</p>}
        <div className="flex gap-4 text-xs text-slate-500 mt-3">
          <span>⏱ {data.duration_minutes} min</span>
          <span>{data.questions.length} questions</span>
          <span>{data.max_score} marks</span>
        </div>
        {data.instructions && (
          <p className="text-sm text-slate-600 mt-3 bg-slate-50 rounded-xl px-4 py-3">{data.instructions}</p>
        )}
      </div>

      <div className="space-y-5 mb-8">
        {data.questions.map((q, i) => (
          <div key={q.id} className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">
                  {TYPE_LABELS[q.type] ?? q.type}
                </span>
                <QuestionPrompt
                  type={q.type}
                  text={q.text}
                  className="text-slate-800 font-semibold mt-1 text-base leading-snug"
                  bodyClassName="text-slate-700 mt-1 text-sm leading-relaxed"
                />
              </div>
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-lg font-medium shrink-0 ml-3">
                {q.marks} mark{q.marks !== 1 ? 's' : ''}
              </span>
            </div>
            {q.type === 'multiple_choice' && <PreviewMCQ q={q} />}
            {q.type === 'ordering' && <PreviewOrdering q={q} />}
            {q.type === 'correct_brackets' && <PreviewBrackets q={q} />}
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <Link
          to={`/exams/${id}`}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          ← Back to Editor
        </Link>
      </div>
    </div>
  );
}
