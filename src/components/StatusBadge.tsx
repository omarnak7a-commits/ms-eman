import type { ExamStatus, AttemptStatus } from '@/types';

const examColors: Record<ExamStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  published: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  closed: 'bg-red-100 text-red-700',
};

const attemptColors: Record<AttemptStatus, string> = {
  active: 'bg-yellow-100 text-yellow-700',
  submitted: 'bg-green-100 text-green-700',
  expired: 'bg-red-100 text-red-700',
};

export function ExamStatusBadge({ status }: { status: ExamStatus }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${examColors[status]}`}>
      {status}
    </span>
  );
}

export function AttemptStatusBadge({ status }: { status: AttemptStatus }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${attemptColors[status]}`}>
      {status}
    </span>
  );
}
