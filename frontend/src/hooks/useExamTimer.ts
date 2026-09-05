import { useState, useEffect, useRef } from 'react';

export function useExamTimer(deadlineAt: string | null) {
  const getSecondsLeft = () => {
    if (!deadlineAt) return 0;
    return Math.max(0, Math.floor((new Date(deadlineAt).getTime() - Date.now()) / 1000));
  };

  const [secondsLeft, setSecondsLeft] = useState(0);
  const expiredFiredRef = useRef(false);

  useEffect(() => {
    // Recompute immediately whenever the (server-authoritative) deadline is
    // set/changed so the value is never left stale at its initial 0.
    setSecondsLeft(getSecondsLeft());
    if (!deadlineAt) return;
    expiredFiredRef.current = false;
    const interval = setInterval(() => {
      const s = getSecondsLeft();
      setSecondsLeft(s);
      if (s <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [deadlineAt]);

  // Without a real deadline there is nothing to have expired. This is the
  // critical guard: before the attempt is loaded (deadline === null) the timer
  // must NOT report as expired, otherwise an active attempt could be
  // auto-submitted the moment the exam page mounts.
  const isExpired = deadlineAt !== null && secondsLeft <= 0;

  const formatted = (() => {
    const m = Math.floor(Math.max(0, secondsLeft) / 60);
    const s = Math.max(0, secondsLeft) % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  })();

  return { secondsLeft, isExpired, formatted };
}
