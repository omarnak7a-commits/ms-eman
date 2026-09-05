import { questionPromptParts } from '@/lib/questionPrompt';

interface QuestionPromptProps {
  type: string;
  text?: string | null;
  /** Class applied to the fixed header (MCQ: the question text). */
  className?: string;
  /** Optional override for the body line below a fixed header. */
  bodyClassName?: string;
}

/**
 * Renders a question's prompt. Ordering and correct-brackets questions always
 * show their fixed header automatically (never duplicated); MCQ text is shown
 * exactly as before (no header).
 */
export function QuestionPrompt({ type, text, className, bodyClassName }: QuestionPromptProps) {
  const { header, body } = questionPromptParts(type, text);
  const headerCls = className ?? '';
  const bodyCls = bodyClassName ?? headerCls;

  return (
    <>
      {header && <p className={headerCls}>{header}</p>}
      {body && <p className={bodyCls}>{body}</p>}
    </>
  );
}
