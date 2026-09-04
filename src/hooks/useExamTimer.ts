import { useState, useEffect, useRef } from 'react';

export function useExamTimer(deadlineAt: string | null) {
  const getSecondsLeft = () => {
    if (!deadlineAt) return 0;
    return Math.max(0, Math.floor((new Date(deadlineAt).getTime() - Date.now()) / 1000));
  };

  const [secondsLeft, setSecondsLeft] = useState(getSecondsLeft);
  const expiredFiredRef = useRef(false);

  useEffect(() => {
    if (!deadlineAt) return;
    expiredFiredRef.current = false;
    const interval = setInterval(() => {
      const s = getSecondsLeft();
      setSecondsLeft(s);
      if (s <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [deadlineAt]);

  const isExpired = secondsLeft <= 0;

  const formatted = (() => {
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  })();

  return { secondsLeft, isExpired, formatted };
}
