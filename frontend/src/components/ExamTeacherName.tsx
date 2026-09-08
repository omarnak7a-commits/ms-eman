/**
 * The teacher/brand name shown prominently to students throughout the exam
 * experience (start card, exam-taking screen, review/result). Kept as a single
 * reusable component so the markup and wording stay consistent everywhere.
 */
export function ExamTeacherName({ className = '' }: { className?: string }) {
  return (
    <div className={`text-center ${className}`} role="banner" aria-label="Teacher" translate="no">
      <p className="text-base sm:text-lg font-extrabold text-slate-800 tracking-tight">Ms Eman Zahy</p>
    </div>
  );
}
