import { useParams, Link } from 'react-router-dom';
import { resultsApi } from '@/lib/api/results';
import { examsApi } from '@/lib/api/exams';
import { useAsync } from '@/hooks/useAsync';
import { formatCorrectAnswer, formatStudentAnswer } from '@/lib/formatAnswers';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { QuestionPrompt } from '@/components/QuestionPrompt';

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export function AttemptDetailPage() {
  const { id, attemptId } = useParams<{ id: string; attemptId: string }>();
  const { data: detail, loading, error } = useAsync(
    () => resultsApi.attemptDetail(id!, attemptId!),
    [id, attemptId],
  );
  const { data: exam } = useAsync(() => examsApi.get(id!), [id]);

  if (loading) return <LoadingSpinner className="py-20" />;
  if (error) return <div className="p-8 text-center text-slate-500">{error}</div>;
  if (!detail) return <div className="p-8 text-center text-slate-500">Attempt not found.</div>;

  const studentName = detail.student_name || 'Student';
  const examTitle = detail.status ? (exam?.title || '') : '';

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-6">
        <Link to="/exams" className="hover:text-blue-600">Exams</Link>
        <span>/</span>
        <Link to={`/exams/${id}`} className="hover:text-blue-600">{exam?.title}</Link>
        <span>/</span>
        <Link to={`/exams/${id}/results`} className="hover:text-blue-600">Results</Link>
        <span>/</span>
        <span className="text-slate-700">{studentName}</span>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800">{studentName}</h1>
            <p className="text-slate-500 text-sm mt-0.5">{examTitle}</p>
          </div>
          {detail.rank && exam?.ranking_enabled && (
            <div className="text-center bg-blue-50 rounded-2xl px-4 py-2">
              <div className="text-xl font-bold text-blue-700">#{detail.rank}</div>
              <div className="text-xs text-blue-500">Rank</div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-28 bg-slate-50 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-slate-800">{detail.score} / {detail.max_score}</div>
            <div className="text-xs text-slate-500 mt-0.5">Score</div>
          </div>
          <div className="flex-1 min-w-28 bg-slate-50 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-slate-800">{detail.percentage}%</div>
            <div className="text-xs text-slate-500 mt-0.5">Percentage</div>
          </div>
          <div className="flex-1 min-w-28 bg-slate-50 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-slate-800">{formatTime(detail.time_used_seconds)}</div>
            <div className="text-xs text-slate-500 mt-0.5">Time used</div>
          </div>
        </div>
      </div>

      <div className="space-y-3 mb-6">
        {detail.answers.map((item, i) => {
          const isCorrect = item.is_correct;
          const studentAnswer = formatStudentAnswer(item.question_type, item.student_answer, item.correct_answer);
          const correct = formatCorrectAnswer(item.question_type, item.correct_answer);
          return (
            <div key={item.question_id} className={`bg-white border rounded-2xl p-5 ${
              isCorrect === true ? 'border-green-200' : isCorrect === false ? 'border-red-200' : 'border-slate-200'
            }`}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-bold text-slate-400 mt-1">Q{i + 1}</span>
                <div className="flex-1">
                  <QuestionPrompt
                    type={item.question_type}
                    text={item.text}
                    className="text-slate-800 font-medium"
                    bodyClassName="text-slate-600 text-sm mt-0.5"
                  />
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  isCorrect === true ? 'bg-green-100 text-green-700' :
                  isCorrect === false ? 'bg-red-100 text-red-700' :
                  'bg-slate-100 text-slate-600'
                }`}>
                  {isCorrect === true ? `+${item.marks}` : isCorrect === false ? '0' : '—'}
                </span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="text-slate-500 w-28 shrink-0">Student answer:</span>
                  <span className={`font-medium ${
                    isCorrect === true ? 'text-green-700' : isCorrect === false ? 'text-red-700' : 'text-slate-600'
                  }`}>{studentAnswer}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-slate-500 w-28 shrink-0">Correct answer:</span>
                  <span className="font-medium text-slate-800">{correct}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
