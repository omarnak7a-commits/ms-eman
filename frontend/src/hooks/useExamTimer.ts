import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Parse a server deadline into epoch MILLISECONDS, or null when unusable.
 *
 * The backend emits canonical ISO-8601 UTC ("Z") timestamps, but this parser
 * also normalises every legacy/defensive shape so the countdown NEVER depends
 * on engine-specific Date leniency (the production bug: desktop V8 parsed the
 * old "...123456+00:00" wire format while strict mobile engines rejected it,
 * leaving phones with a dead timer):
 *
 *  - space separator ("2026-09-06 21:15:30")     → "T"
 *  - >3 fractional-second digits (microseconds)  → truncated to ms
 *  - "+HHMM" offset without colon                 → "+HH:MM"
 *  - zone-less strings                           → treated as UTC, NEVER local
 *    (backend datetimes are UTC; reading them as device-local silently shifts
 *    the deadline by the student's UTC offset)
 */
export function parseDeadlineMs(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null;
  let s = value.trim();
  if (!s) return null;

  s = s.replace(' ', 'T');
  s = s.replace(/(\.\d{3})\d+/, '$1');
  s = s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(s)) s += 'Z';

  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/**
 * Server-authoritative exam countdown.
 *
 * @param deadlineAt    canonical UTC deadline string from the backend
 * @param serverSeconds server-computed remaining seconds shipped alongside
 *                      the deadline. Used to seed the display immediately and
 *                      as the fallback clock source if a deadline string ever
 *                      fails to parse — the countdown then still reflects the
 *                      server's value instead of collapsing to 00:00.
 *
 * Semantics preserved from the original hook:
 *  - no deadline yet (null) → 0 seconds and NOT expired (an active attempt
 *    must never auto-submit before its data arrives);
 *  - genuinely passed deadline → 0 seconds and expired.
 * secondsLeft is always a finite integer ≥ 0 — never NaN.
 */
export function useExamTimer(deadlineAt: string | null, serverSeconds: number | null = null) {
  const deadlineMs = useMemo(() => parseDeadlineMs(deadlineAt), [deadlineAt]);
  const hasDeadline = typeof deadlineAt === 'string' && deadlineAt.trim() !== '';

  // Fallback clock: server-provided seconds anchored to the moment we saw
  // them (wall-clock elapsed math, so throttled background tabs still drift
  // correctly). Only used while no parsable deadline exists.
  const seedRef = useRef<{ seconds: number; anchoredAt: number } | null>(null);
  if (deadlineMs === null && typeof serverSeconds === 'number' && Number.isFinite(serverSeconds)) {
    const secs = Math.max(0, Math.floor(serverSeconds));
    const current = seedRef.current;
    if (!current || current.seconds !== secs) seedRef.current = { seconds: secs, anchoredAt: Date.now() };
  } else if (deadlineMs !== null) {
    seedRef.current = null;
  }
  const hasSeed = deadlineMs === null && seedRef.current !== null;

  const computeSecondsLeft = useCallback((): number => {
    if (deadlineMs !== null) {
      const diff = Math.floor((deadlineMs - Date.now()) / 1000);
      return Number.isFinite(diff) ? Math.max(0, diff) : 0;
    }
    const seed = seedRef.current;
    if (seed) {
      const elapsed = Math.floor((Date.now() - seed.anchoredAt) / 1000);
      return Math.max(0, seed.seconds - elapsed);
    }
    return 0;
  }, [deadlineMs]);

  const [secondsLeft, setSecondsLeft] = useState<number>(computeSecondsLeft);

  // Derived-state sync: when the deadline/seed source changes, adopt the new
  // value during render (no one-frame "00:00" flash before the effect runs).
  const sourceKey = `${deadlineMs ?? 'none'}|${hasSeed ? seedRef.current?.seconds : 'none'}`;
  const [trackedKey, setTrackedKey] = useState(sourceKey);
  if (trackedKey !== sourceKey) {
    setTrackedKey(sourceKey);
    setSecondsLeft(computeSecondsLeft());
  }

  useEffect(() => {
    setSecondsLeft(computeSecondsLeft());
    if (!hasDeadline && !hasSeed) return;
    const interval = setInterval(() => {
      const s = computeSecondsLeft();
      setSecondsLeft(s);
      if (s <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [computeSecondsLeft, hasDeadline, hasSeed]);

  // Without a REAL (parsable) deadline or a server seed there is nothing to
  // have expired. This is the critical guard: before the attempt is loaded
  // the timer must NOT report as expired, otherwise an active attempt could
  // be auto-submitted the moment the exam page mounts. An unparsable
  // deadline string with no seed is likewise "unknown", not "expired" — the
  // server still enforces the true deadline on every request.
  const isExpired = (deadlineMs !== null || hasSeed) && secondsLeft <= 0;

  const formatted = (() => {
    const safe = Number.isFinite(secondsLeft) ? Math.max(0, secondsLeft) : 0;
    const m = Math.floor(safe / 60);
    const s = safe % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  })();

  return { secondsLeft, isExpired, formatted };
}
