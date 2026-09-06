import { useEffect, useRef, useState } from 'react';

/**
 * Student exam timer — the `whatsapp-exam-bot` timing model, migrated 1:1:
 *
 *   server (start/resume) → integer `remaining_seconds`
 *     → state seed → 1s countdown → zero → auto-submit the attempt
 *
 * Reference behaviour reproduced here:
 *  - The ONLY clock input is the server-computed integer remaining seconds
 *    shipped with the start/resume responses. The countdown performs pure
 *    integer arithmetic and contains NO `Date.parse` / `new Date(string)`
 *    at all — which is exactly why the reference timer displays correctly
 *    on every mobile engine (nothing engine/locale/timezone-specific is
 *    ever executed).
 *  - Refresh/resume re-seeds from the server's fresh remaining value, so a
 *    reload can never reset the clock to the full duration.
 *  - Zero → the page's existing auto-submit finalises the attempt; the
 *    server grades/finalises authoritatively (same as the reference's
 *    `completeAttempt`).
 *
 * One deliberate hardening over the reference's per-tick `prev - 1`:
 * the decrement is evaluated as `seed − elapsed(Date.now())`. Browser
 * throttling of intervals in backgrounded tabs would otherwise let the
 * display drift from real server time; elapsed-math shows the true
 * remaining time the moment the student returns. This changes nothing
 * about authority: the server stores the deadline, re-computes remaining
 * on every request, and rejects everything past the deadline.
 *
 * Anti-cheating: manipulating the device clock can never extend the exam.
 * Rolling the clock backwards is clamped (`elapsed ≥ 0`), so the display
 * can at most freeze at the last server-seeded value; rolling it forwards
 * can only end the student's own attempt sooner. The true deadline is
 * enforced exclusively by the backend on every answer/submit/resume call.
 */
export function useExamTimer(serverSeconds: number | null) {
  // Server seed: { remaining seconds at response time, client instant seen,
  // high-water mark of elapsed seconds observed since }.
  const seedRef = useRef<{
    seconds: number;
    anchoredAt: number;
    maxElapsed: number;
  } | null>(null);

  // Normalise the server value: only finite non-negative integers are usable.
  const validSeed =
    typeof serverSeconds === 'number' && Number.isFinite(serverSeconds)
      ? Math.max(0, Math.floor(serverSeconds))
      : null;

  // (Re)seed whenever the SERVER reports a remaining value we are not
  // already counting from. Same value across re-renders → keep counting,
  // never restart. New value (start, refresh, resume) → re-anchor.
  const current = seedRef.current;
  if (validSeed !== null && (!current || current.seconds !== validSeed)) {
    seedRef.current = { seconds: validSeed, anchoredAt: Date.now(), maxElapsed: 0 };
  }

  const computeSecondsLeft = (): number => {
    const seed = seedRef.current;
    if (!seed) return 0;
    // Elapsed is MONOTONIC: a device clock rolled backwards freezes the
    // display at the last legitimate value instead of winding it back up —
    // the countdown can never be extended by manipulating the clock.
    const raw = Math.max(0, Math.floor((Date.now() - seed.anchoredAt) / 1000));
    const elapsed = Math.max(seed.maxElapsed, raw);
    seed.maxElapsed = elapsed;
    return Math.max(0, seed.seconds - elapsed);
  };

  const [secondsLeft, setSecondsLeft] = useState<number>(computeSecondsLeft);
  const seedKey = seedRef.current
    ? `${seedRef.current.seconds}@${seedRef.current.anchoredAt}`
    : 'none';

  // Derived-state sync: adopt a new server seed during render so the very
  // first paint already shows the real remaining time (no 00:00 flash, no
  // initialization race).
  const [trackedKey, setTrackedKey] = useState(seedKey);
  if (trackedKey !== seedKey) {
    setTrackedKey(seedKey);
    setSecondsLeft(computeSecondsLeft());
  }

  useEffect(() => {
    setSecondsLeft(computeSecondsLeft());
    if (!seedRef.current) return;
    const interval = setInterval(() => {
      const s = computeSecondsLeft();
      setSecondsLeft(s);
      if (s <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  // No server seed yet (attempt data not loaded) → 00:00 but NOT expired:
  // an active attempt must never be auto-submitted before its data arrives.
  // A genuinely drained seed → 00:00 and expired → the page auto-submits.
  const isExpired = seedRef.current !== null && secondsLeft <= 0;

  const safe = Number.isFinite(secondsLeft) ? Math.max(0, secondsLeft) : 0;
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  const formatted = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  return { secondsLeft, isExpired, formatted };
}
