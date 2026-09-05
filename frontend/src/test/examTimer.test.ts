/**
 * MOBILE TIMER REGRESSION SUITE.
 *
 * Production bug: desktop showed the correct countdown, phones showed 00:00
 * from the moment the exam opened. The old wire format was engine-dependent
 * (Postgres → "...123456+00:00", SQLite → zone-less), and the old hook fed it
 * straight into `new Date(...)` — V8 (desktop/Android Chrome) swallowed every
 * variant, strict mobile engines did not.
 *
 * These tests pin the fix from both sides:
 *  - `parseDeadlineMs` normalises ANY legacy shape into something canonical
 *    before parsing and never yields NaN;
 *  - a STRICT-ENGINE emulation (Date.parse accepts only the exact ES Date
 *    Time String Format, like picky mobile engines) deterministically
 *    reproduces the bug against the old logic and proves the new logic and
 *    the new canonical wire format survive it;
 *  - `useExamTimer` honours server `remaining_seconds`, keeps the server
 *    authoritative, and never reports expired before data loads.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { parseDeadlineMs, useExamTimer } from '@/hooks/useExamTimer';

// The exact ES Date Time String Format — what conforming engines MUST parse.
// Strict mobile engines (the bug repro) accept essentially only this.
const STRICT_FORMAT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

const REAL_PARSE = Date.parse;

/** Emulate a strict mobile JS engine: reject every non-canonical string. */
function enableStrictEngine() {
  vi.spyOn(Date, 'parse').mockImplementation((s: string) => {
    if (typeof s === 'string' && STRICT_FORMAT.test(s)) return REAL_PARSE(s);
    return NaN; // what strict engines return for e.g. "...123456+00:00"
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ── parseDeadlineMs: shape coverage ─────────────────────────────────────────

describe('parseDeadlineMs (mobile-safe timestamp handling)', () => {
  it('parses a valid UTC "Z" deadline', () => {
    expect(parseDeadlineMs('2026-09-06T21:15:30Z')).toBe(Date.UTC(2026, 8, 6, 21, 15, 30));
    expect(parseDeadlineMs('2026-09-06T21:15:30.123Z')).toBe(
      Date.UTC(2026, 8, 6, 21, 15, 30, 123),
    );
  });

  it('honours an explicit timezone offset', () => {
    // +02:00 → 19:15:30 UTC
    expect(parseDeadlineMs('2026-09-06T21:15:30+02:00')).toBe(Date.UTC(2026, 8, 6, 19, 15, 30));
    expect(parseDeadlineMs('2026-09-06T21:15:30-05:00')).toBe(Date.UTC(2026, 8, 7, 2, 15, 30));
  });

  it('treats zone-less strings as UTC — never device-local', () => {
    expect(parseDeadlineMs('2026-09-06T21:15:30.123456')).toBe(
      Date.UTC(2026, 8, 6, 21, 15, 30, 123),
    );
  });

  it('normalises legacy shapes (space separator, microseconds, +HHMM)', () => {
    expect(parseDeadlineMs('2026-09-06 21:15:30')).toBe(Date.UTC(2026, 8, 6, 21, 15, 30));
    expect(parseDeadlineMs('2026-09-06T21:15:30.123456Z')).toBe(
      Date.UTC(2026, 8, 6, 21, 15, 30, 123),
    );
    expect(parseDeadlineMs('2026-09-06T21:15:30+0200')).toBe(Date.UTC(2026, 8, 6, 19, 15, 30));
  });

  it('returns null for invalid/missing deadlines (never NaN)', () => {
    expect(parseDeadlineMs(null)).toBeNull();
    expect(parseDeadlineMs(undefined)).toBeNull();
    expect(parseDeadlineMs('')).toBeNull();
    expect(parseDeadlineMs('   ')).toBeNull();
    expect(parseDeadlineMs('not-a-date')).toBeNull();
    expect(parseDeadlineMs('2026-13-99T99:99:99Z')).toBeNull();
  });

  it('survives a strict mobile engine that rejects the old wire format', () => {
    enableStrictEngine();
    // The OLD production wire format (Postgres): 6-digit fraction + offset.
    // The strict engine rejects it outright → this is the phone bug repro:
    expect(Date.parse('2026-09-06T21:15:30.123456+00:00')).toBeNaN();
    // …but the normaliser converts it to canonical form FIRST, so parsing
    // still succeeds through parseDeadlineMs:
    expect(parseDeadlineMs('2026-09-06T21:15:30.123456+00:00')).toBe(
      Date.UTC(2026, 8, 6, 21, 15, 30, 123),
    );
    // And the NEW canonical wire format parses even on the strict engine:
    expect(parseDeadlineMs('2026-09-06T21:15:30.123Z')).toBe(
      Date.UTC(2026, 8, 6, 21, 15, 30, 123),
    );
  });
});

// ── useExamTimer: countdown behavior ────────────────────────────────────────

describe('useExamTimer', () => {
  const isoIn = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();

  it('shows the real remaining time for a deadline > 1 minute away', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-06T10:00:00Z'));
    const { result } = renderHook(() => useExamTimer('2026-09-06T10:30:00Z'));
    expect(result.current.secondsLeft).toBe(1800);
    expect(result.current.formatted).toBe('30:00');
    expect(result.current.isExpired).toBe(false);
  });

  it('counts down below one minute with correct MM:SS formatting', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-06T10:00:00Z'));
    const { result } = renderHook(() => useExamTimer('2026-09-06T10:00:45Z'));
    expect(result.current.formatted).toBe('00:45');
    act(() => {
      vi.advanceTimersByTime(40_000);
    });
    expect(result.current.secondsLeft).toBe(5);
    expect(result.current.formatted).toBe('00:05');
    expect(result.current.isExpired).toBe(false);
  });

  it('expired deadline → 00:00 and isExpired=true', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-06T10:00:00Z'));
    const { result } = renderHook(() => useExamTimer('2026-09-06T09:59:00Z'));
    expect(result.current.secondsLeft).toBe(0);
    expect(result.current.formatted).toBe('00:00');
    expect(result.current.isExpired).toBe(true);
  });

  it('no deadline yet (initial render before attempt data) → 00:00 but NOT expired', () => {
    const { result } = renderHook(() => useExamTimer(null));
    expect(result.current.secondsLeft).toBe(0);
    expect(result.current.formatted).toBe('00:00');
    expect(result.current.isExpired).toBe(false); // critical auto-submit guard
  });

  it('invalid deadline + server seconds → seeded countdown, never NaN/00:00', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-06T10:00:00Z'));
    const { result } = renderHook(() => useExamTimer('garbage-from-an-old-client', 1500));
    expect(result.current.secondsLeft).toBe(1500);
    expect(result.current.formatted).toBe('25:00');
    expect(result.current.isExpired).toBe(false);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current.secondsLeft).toBe(1470);
  });

  it('invalid deadline without server seconds → unknown, not expired (server stays authoritative)', () => {
    const { result } = renderHook(() => useExamTimer('garbage'));
    expect(result.current.secondsLeft).toBe(0);
    expect(Number.isNaN(result.current.secondsLeft)).toBe(false);
    expect(result.current.isExpired).toBe(false);
  });

  it('refresh/resume: re-rendering with the resumed deadline keeps real time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-06T10:00:00Z'));
    const { result, rerender } = renderHook(
      ({ d, s }: { d: string | null; s: number | null }) => useExamTimer(d, s),
      { initialProps: { d: null as string | null, s: null as number | null } },
    );
    // Before resume data: nothing, not expired.
    expect(result.current.isExpired).toBe(false);
    // Resume arrives (10 min left per the server).
    rerender({ d: '2026-09-06T10:10:00Z', s: 600 });
    expect(result.current.secondsLeft).toBe(600);
    expect(result.current.formatted).toBe('10:00');
    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(result.current.secondsLeft).toBe(539);
    // Wall-clock anchored: jumping the clock forward expires it properly.
    act(() => {
      vi.setSystemTime(new Date('2026-09-06T10:10:01Z'));
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.secondsLeft).toBe(0);
    expect(result.current.isExpired).toBe(true);
  });

  it('parses offset-form deadlines identically on every engine', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-06T10:00:00Z'));
    const { result } = renderHook(() => useExamTimer('2026-09-06T12:30:00+02:00'));
    expect(result.current.secondsLeft).toBe(1800); // 12:30+02:00 = 10:30 UTC
  });

  it('OLD LOGIC repro: strict engine + old wire format produced the broken timer', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-06T10:00:00Z'));
    enableStrictEngine();

    // Exactly what the old hook did: raw date-parse math on the wire string.
    // On a strict mobile engine that parse is NaN (on real phones
    // `new Date(str).getTime()` === `Date.parse(str)`), which is the failure.
    const oldWire = '2026-09-06T10:30:00.123456+00:00';
    const parsedOnStrictEngine = Date.parse(oldWire);
    expect(Number.isNaN(parsedOnStrictEngine)).toBe(true); // ← the phone bug
    const legacySecondsLeft = Math.max(0, Math.floor((parsedOnStrictEngine - Date.now()) / 1000));
    expect(Number.isNaN(legacySecondsLeft)).toBe(true);
    // The old formatted output was unusable — never the real countdown.
    expect(String(Math.floor(Math.max(0, legacySecondsLeft) / 60))).not.toBe('30');

    // New hook with the same deadline (plus server seconds, as shipped now):
    const { result } = renderHook(() => useExamTimer(oldWire, 1800));
    expect(result.current.secondsLeft).toBe(1800);
    expect(result.current.formatted).toBe('30:00');
    expect(result.current.isExpired).toBe(false);
  });

  it('NEW canonical wire format works even under the strict mobile engine', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-06T10:00:00Z'));
    enableStrictEngine();
    const { result } = renderHook(() => useExamTimer('2026-09-06T10:30:00.123Z', 1800));
    expect(result.current.secondsLeft).toBe(1800);
    expect(result.current.formatted).toBe('30:00');
    expect(result.current.isExpired).toBe(false);
  });
});
