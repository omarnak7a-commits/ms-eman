import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { examsApi, type ExamApiOut } from '@/lib/api/exams';
import {
  resultsApi,
  type OverallRankingEntry,
  type OverallRankingResponse,
  type RankingEntry,
  type RankingResponse,
} from '@/lib/api/results';

type RankingData = RankingResponse | OverallRankingResponse;
type RankingRow = RankingEntry | OverallRankingEntry;

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Unable to load ranking data. Please try again.';
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function formatPercentage(value: number): string {
  return `${formatNumber(value)}%`;
}

function formatSubmitted(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatExamSummaryScore(ranking: RankingResponse, value: number): string {
  const totals = new Set(ranking.entries.map(entry => entry.total_marks));
  if (totals.size !== 1) return formatNumber(value);
  const [total] = totals;
  return `${formatNumber(value)} / ${formatNumber(total)}`;
}

const placeLabels: Record<number, string> = {
  1: '1st Place',
  2: '2nd Place',
  3: '3rd Place',
};

const medalLabels: Record<number, string> = {
  1: '🥇',
  2: '🥈',
  3: '🥉',
};

const rankStyles: Record<number, string> = {
  1: 'border-amber-200 bg-amber-50 text-amber-800',
  2: 'border-slate-200 bg-slate-50 text-slate-700',
  3: 'border-orange-200 bg-orange-50 text-orange-800',
};

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    return (
      <span
        className={`inline-flex min-w-16 items-center justify-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${rankStyles[rank]}`}
        aria-label={`Rank ${rank}, ${placeLabels[rank]}`}
      >
        <span aria-hidden="true">{medalLabels[rank]}</span>
        <span>#{rank}</span>
      </span>
    );
  }
  return <span className="font-semibold text-slate-600">#{rank}</span>;
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="text-2xl font-bold tracking-tight text-slate-800">{value}</div>
      <div className="mt-1 text-sm text-slate-500">{label}</div>
    </div>
  );
}

function RankingSkeleton() {
  return (
    <div className="animate-pulse" aria-label="Loading student ranking" role="status">
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map(item => (
          <div key={item} className="h-24 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="h-6 w-20 rounded bg-slate-200" />
            <div className="mt-3 h-3 w-28 rounded bg-slate-100" />
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="h-16 border-b border-slate-100 p-4">
          <div className="h-9 max-w-sm rounded-xl bg-slate-100" />
        </div>
        <div className="space-y-4 p-5">
          {[0, 1, 2, 3, 4].map(item => (
            <div key={item} className="flex items-center gap-5">
              <div className="h-8 w-14 rounded-full bg-slate-100" />
              <div className="h-4 flex-1 rounded bg-slate-100" />
              <div className="h-4 w-20 rounded bg-slate-100" />
              <div className="hidden h-4 w-28 rounded bg-slate-100 sm:block" />
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function TopThree({ ranking }: { ranking: RankingData }) {
  const top = (ranking.entries as RankingRow[]).slice(0, 3);
  if (top.length === 0) return null;

  return (
    <section aria-labelledby="top-performers-title" className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="top-performers-title" className="text-sm font-semibold text-slate-700">
          Top performers
        </h2>
        <span className="text-xs text-slate-400">Based on submitted results</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {top.map(entry => {
          const metric =
            ranking.scope === 'all'
              ? formatPercentage((entry as OverallRankingEntry).average_percentage)
              : formatPercentage((entry as RankingEntry).percentage);
          return (
            <div
              key={`${entry.rank}-${entry.student_name}`}
              className={`rounded-2xl border p-4 ${rankStyles[entry.rank]}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide opacity-80">
                  {placeLabels[entry.rank]}
                </span>
                <span className="text-xl" aria-hidden="true">{medalLabels[entry.rank]}</span>
              </div>
              <div className="mt-3 truncate text-sm font-semibold" title={entry.student_name}>
                {entry.student_name}
              </div>
              <div className="mt-1 text-xl font-bold">{metric}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SpecificExamTable({ entries }: { entries: RankingEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs text-slate-500">
            <th className="px-5 py-3.5 font-medium">Rank</th>
            <th className="px-5 py-3.5 font-medium">Student</th>
            <th className="px-5 py-3.5 font-medium">Score</th>
            <th className="px-5 py-3.5 font-medium">Percentage</th>
            <th className="px-5 py-3.5 font-medium">Submitted</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {entries.map(entry => (
            <tr
              key={entry.attempt_id}
              className={entry.rank <= 3 ? 'bg-slate-50/35' : 'transition-colors hover:bg-slate-50'}
            >
              <td className="px-5 py-4"><RankBadge rank={entry.rank} /></td>
              <td className="px-5 py-4 font-medium text-slate-800">{entry.student_name}</td>
              <td className="px-5 py-4 text-slate-700">
                <span className="font-semibold">{formatNumber(entry.score)}</span>
                <span className="text-slate-400"> / {formatNumber(entry.total_marks)}</span>
              </td>
              <td className="px-5 py-4 font-semibold text-blue-700">
                {formatPercentage(entry.percentage)}
              </td>
              <td className="whitespace-nowrap px-5 py-4 text-slate-500">
                {formatSubmitted(entry.submitted_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OverallTable({ entries }: { entries: OverallRankingEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs text-slate-500">
            <th className="px-5 py-3.5 font-medium">Rank</th>
            <th className="px-5 py-3.5 font-medium">Student</th>
            <th className="px-5 py-3.5 font-medium">Exams</th>
            <th className="px-5 py-3.5 font-medium">Average</th>
            <th className="px-5 py-3.5 font-medium">Best</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {entries.map(entry => (
            <tr
              key={`${entry.rank}-${entry.student_name}`}
              className={entry.rank <= 3 ? 'bg-slate-50/35' : 'transition-colors hover:bg-slate-50'}
            >
              <td className="px-5 py-4"><RankBadge rank={entry.rank} /></td>
              <td className="px-5 py-4 font-medium text-slate-800">{entry.student_name}</td>
              <td className="px-5 py-4 text-slate-600">{entry.exams_completed}</td>
              <td className="px-5 py-4 font-semibold text-blue-700">
                {formatPercentage(entry.average_percentage)}
              </td>
              <td className="px-5 py-4 text-slate-600">
                {formatPercentage(entry.best_percentage)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StudentRankingPage() {
  const [exams, setExams] = useState<ExamApiOut[]>([]);
  const [examsLoading, setExamsLoading] = useState(true);
  const [examsError, setExamsError] = useState('');
  const [examsReload, setExamsReload] = useState(0);
  const [selectedExam, setSelectedExam] = useState('all');
  const [ranking, setRanking] = useState<RankingData | null>(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingError, setRankingError] = useState('');
  const [rankingReload, setRankingReload] = useState(0);
  const [search, setSearch] = useState('');

  const retryExams = useCallback(() => setExamsReload(value => value + 1), []);
  const retryRanking = useCallback(() => setRankingReload(value => value + 1), []);

  useEffect(() => {
    let active = true;
    setExamsLoading(true);
    setExamsError('');
    examsApi
      .list()
      .then(data => {
        if (!active) return;
        setExams(data);
        setExamsLoading(false);
        setSelectedExam(current =>
          current !== 'all' && !data.some(exam => exam.id === current) ? 'all' : current,
        );
      })
      .catch(error => {
        if (!active) return;
        setExamsError(errorMessage(error));
        setExamsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [examsReload]);

  useEffect(() => {
    if (examsLoading || examsError || exams.length === 0) {
      setRanking(null);
      setRankingLoading(false);
      return;
    }

    let active = true;
    setRankingLoading(true);
    setRankingError('');
    setRanking(null);
    const request =
      selectedExam === 'all'
        ? resultsApi.teacherOverallRanking()
        : resultsApi.teacherRanking(selectedExam);
    request
      .then(data => {
        if (!active) return;
        setRanking(data);
        setRankingLoading(false);
      })
      .catch(error => {
        if (!active) return;
        setRankingError(errorMessage(error));
        setRankingLoading(false);
      });
    return () => {
      active = false;
    };
  }, [exams, examsError, examsLoading, rankingReload, selectedExam]);

  const filteredEntries = useMemo(() => {
    if (!ranking) return [] as RankingRow[];
    const term = search.trim().toLocaleLowerCase();
    const entries = ranking.entries as RankingRow[];
    if (!term) return entries;
    return entries.filter(entry => entry.student_name.toLocaleLowerCase().includes(term));
  }, [ranking, search]);

  const handleExamChange = (value: string) => {
    setSelectedExam(value);
    setSearch('');
  };

  const showNoExams = !examsLoading && !examsError && exams.length === 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-7">
        <h1 className="text-2xl font-bold text-slate-800">Student Ranking</h1>
        <p className="mt-1 text-sm text-slate-500">
          View and compare student performance across your exams.
        </p>
      </header>

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <label htmlFor="ranking-exam" className="mb-2 block text-sm font-semibold text-slate-700">
          Select Exam
        </label>
        <select
          id="ranking-exam"
          value={selectedExam}
          onChange={event => handleExamChange(event.target.value)}
          disabled={examsLoading || Boolean(examsError) || exams.length === 0}
          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 sm:max-w-md"
        >
          <option value="all">All Exams</option>
          {exams.map(exam => (
            <option key={exam.id} value={exam.id}>{exam.title}</option>
          ))}
        </select>
      </div>

      {examsLoading ? (
        <RankingSkeleton />
      ) : examsError ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-5 py-6 text-center">
          <p className="text-sm font-medium text-red-700">{examsError}</p>
          <button
            type="button"
            onClick={retryExams}
            className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      ) : showNoExams ? (
        <div className="rounded-2xl border border-slate-200 bg-white">
          <EmptyState
            title="No exams available yet."
            description="Create an exam to start comparing student performance."
          />
        </div>
      ) : rankingLoading ? (
        <RankingSkeleton />
      ) : rankingError ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-5 py-6 text-center">
          <p className="text-sm font-medium text-red-700">{rankingError}</p>
          <button
            type="button"
            onClick={retryRanking}
            className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      ) : ranking ? (
        <>
          <section aria-label="Ranking summary" className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <SummaryCard label="Total Students" value={ranking.total_students} />
            <SummaryCard
              label="Average Score"
              value={
                ranking.scope === 'all'
                  ? formatPercentage(ranking.average_percentage)
                  : formatExamSummaryScore(ranking, ranking.average_score)
              }
            />
            <SummaryCard
              label="Highest Score"
              value={
                ranking.scope === 'all'
                  ? formatPercentage(ranking.highest_percentage)
                  : formatExamSummaryScore(ranking, ranking.highest_score)
              }
            />
            <SummaryCard
              label="Lowest Score"
              value={
                ranking.scope === 'all'
                  ? formatPercentage(ranking.lowest_percentage)
                  : formatExamSummaryScore(ranking, ranking.lowest_score)
              }
            />
          </section>

          <TopThree ranking={ranking} />

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-labelledby="ranking-table-title">
            <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 id="ranking-table-title" className="font-semibold text-slate-800">
                  {ranking.exam_title}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {ranking.scope === 'all'
                    ? 'Ranked by average percentage across completed exams.'
                    : 'Ranked by score, with earlier submissions breaking ties.'}
                </p>
              </div>
              <label className="relative block w-full sm:w-72">
                <span className="sr-only">Search student</span>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m21 21-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
                </svg>
                <input
                  type="search"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Search student..."
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </label>
            </div>

            {ranking.entries.length === 0 ? (
              <EmptyState
                title="No submitted attempts yet."
                description="Student rankings will appear here after an exam is submitted."
              />
            ) : filteredEntries.length === 0 ? (
              <EmptyState
                title="No students match your search."
                description="Try a different student name."
              />
            ) : ranking.scope === 'all' ? (
              <OverallTable entries={filteredEntries as OverallRankingEntry[]} />
            ) : (
              <SpecificExamTable entries={filteredEntries as RankingEntry[]} />
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
