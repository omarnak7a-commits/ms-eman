/**
 * Render structured student / correct answers (as returned by the API) into
 * human-readable text, without trusting the client to grade anything.
 */

type Data = Record<string, unknown> | null | undefined;

function asRecord(v: unknown): Data {
  return (v && typeof v === 'object' ? v as Record<string, unknown> : null);
}

function opt(rec: Data, arr: string, id: string): string {
  const items = rec?.[arr];
  if (Array.isArray(items)) {
    const found = (items as Array<{ id?: string; text?: string }>).find(o => o.id === id);
    if (found?.text) return String(found.text);
  }
  return id || '';
}

export function formatStudentAnswer(
  questionType: string,
  studentInput: unknown,
  correctInput: unknown,
): string {
  const student = asRecord(studentInput);
  const correct = asRecord(correctInput);
  if (!student) return '(not answered)';
  if (questionType === 'multiple_choice') {
    const id = student.selected_option_id as string;
    return opt(correct, 'options', id) || '(not answered)';
  }
  if (questionType === 'ordering') {
    const ids = (student.token_ids as string[]) || [];
    if (ids.length === 0) return '(not answered)';
    const correctIds = (correct?.correct_token_ids as string[]) || [];
    const texts = (correct?.correct_tokens as string[]) || [];
    return ids.map(id => {
      const i = correctIds.indexOf(id);
      return i >= 0 ? (texts[i] ?? id) : id;
    }).join(' ');
  }
  if (questionType === 'correct_brackets') {
    const v = student.answer;
    if (v === undefined || v === null || v === '') return '(not answered)';
    if (Array.isArray(v)) return (v as string[]).join(', ');
    return String(v);
  }
  return '—';
}

export function formatCorrectAnswer(questionType: string, correctInput: unknown): string {
  const correct = asRecord(correctInput);
  if (!correct) return '—';
  if (questionType === 'multiple_choice') {
    const correctIds = (correct.correct_option_ids as string[]) || [];
    const items = (correct.options as Array<{ id?: string; text?: string }>) || [];
    const texts = items.filter(o => correctIds.includes(String(o.id))).map(o => o.text || '');
    return texts.length ? texts.join(' / ') : '—';
  }
  if (questionType === 'ordering') {
    const texts = (correct.correct_tokens as string[]) || [];
    return texts.length ? texts.join(' ') : '—';
  }
  if (questionType === 'correct_brackets') {
    const acc = correct.accepted_answers as Record<string, string[]> | undefined;
    if (acc) {
      const first = Object.values(acc)[0];
      if (first && first.length) return first.join(' / ');
    }
    return '—';
  }
  return '—';
}
