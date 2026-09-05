import type { QuestionType } from '@/types';

/**
 * Fixed, question-type-level headers shown automatically for the two
 * sentence-type questions. Kept as constants (not stored in every question's
 * `text`) so teachers/students never have to type them and they stay
 * consistent across every surface that renders a question.
 */
export const FIXED_QUESTION_HEADERS: Partial<Record<QuestionType, string>> = {
  ordering: 'Arrange the following words to make a correct sentence.',
  correct_brackets: 'Choose the correct answer from the brackets.',
};

export interface QuestionPromptParts {
  /** Fixed header to show for this type, or null when the type has none (e.g. MCQ). */
  header: string | null;
  /**
   * Any extra content to show beneath the header. For MCQ this is the
   * question text unchanged (header is null, so rendering is unchanged). For
   * ordering/correct_brackets any stored text that is not just the fixed
   * header itself (so we never duplicate the header).
   */
  body: string | null;
}

/** Remove every occurrence of the fixed header so it is never shown twice. */
function stripHeader(text: string, header: string): string {
  return text
    .split(header)
    .map(part => part.trim())
    .filter(Boolean)
    .join(' ');
}

export function questionPromptParts(type: string, text?: string | null): QuestionPromptParts {
  const header = FIXED_QUESTION_HEADERS[type as QuestionType] ?? null;
  const raw = text ?? '';

  // Types without a fixed header (multiple_choice) are returned verbatim so
  // existing behavior is unchanged.
  if (!header) {
    return { header: null, body: raw };
  }

  const trimmed = raw.trim();
  const body = stripHeader(trimmed, header);
  return { header, body: body || null };
}
