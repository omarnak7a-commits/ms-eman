/**
 * STUDENT EXAM TIMER — regression tests for the migrated whatsapp-exam-bot
 * timing model:
 *
 *   server (start/resume) → integer remaining_seconds → seed → 1s countdown
 *   → zero → auto-submit
 *
 * The countdown performs pure integer arithmetic seeded by the server; it
 * contains no Date parsing at all (the property that makes the reference
 * timer work on every mobile engine). These tests pin the exact scenarios
 * from the migration brief:
 *
 *   Start     → 30:00 then 29:59, 29:58 — never 00:00
 *   Refresh   → re-seeds ~25:00 after 5 minutes — never resets to 30:00
 *   Background→ returning shows real elapsed server time
 *   Zero      → 00:00 + isExpired (page auto-submits)
 *   Expired   → server seed 0 → immediately zero/expired
 *   Invalid   → missing/garbage seed is NOT turned into a fake expired timer
 *   Anti-cheat→ rolling the device clock back cannot extend the display
 *
 * NOTE: no real mobile browser exists in this sandbox (browser downloads are
 * network-blocked); the mobile-compatibility guarantee here is structural —
 * the tests assert the hook never invokes Date.parse during the countdown.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useExamTimer } from '@/hooks/useExamTimer';

const BASE = new Date('2026-09-06T10:00:00Z');

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

type SeedProps = { s: number | null };
const renderTimer = (initial: number | null) =>
  renderHook(({ s }: SeedProps) => useExamTimer(s), {
    initialProps: { s: initial } as SeedProps,
  });

describe('Start (reference scenario)', () => {
  it('30-minute exam seeds 30:00 and counts 29:59, 29:58 — never 00:00', () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
    const { result } = renderTimer(1800);
    expect(result.current.formatted).toBe('30:00');
    expect(result.current.secondsLeft).toBe(1800);
    expect(result.current.isExpired).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.formatted).toBe('29:59');

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.formatted).toBe('29:58');
    expect(result.current.isExpired).toBe(false);
  });

  it('the countdown never parses dates (mobile immunity by construction)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
    const parseSpy = vi.spyOn(Date, 'parse');
    const isoSpy = vi.spyOn(Date.prototype, 'toISOString');
    const { result } = renderTimer(1800);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.formatted).toBe('29:55');
    expect(parseSpy).not.toHaveBeenCalled();
    expect(isoSpy).not.toHaveBeenCalled();
  });
});

describe('Refresh / resume (reference scenario)', () => {
  it('refresh after ~5 minutes re-seeds ≈25:00 and never resets to 30:00', () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
    const { result, rerender } = renderTimer(null);

    // Before the attempt data arrives: 00:00 but NOT expired (no
    // auto-submit on load — the reference guards on attempt status).
    expect(result.current.formatted).toBe('00:00');
    expect(result.current.isExpired).toBe(false);

    // Start/resume response: 30 minutes remain per the server.
    rerender({ s: 1800 });
    expect(result.current.formatted).toBe('30:00');

    // 5 minutes of real time pass…
    act(() => {
      vi.advanceTimersByTime(5 * 60_000);
    });
    expect(result.current.secondsLeft).toBe(1500);

    // …student refreshes: the server re-seeds with ITS remaining value
    // (≈1500). The clock must continue from there — never restart at 30:00.
    rerender({ s: 1500 });
    expect(result.current.formatted).toBe('25:00');
    expect(result.current.secondsLeft).toBeLessThanOrEqual(1500);
    expect(result.current.secondsLeft).toBeGreaterThan(24 * 60);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.secondsLeft).toBe(1440); // 24:00, still counting
  });

  it('a slightly drifted server re-seed is adopted (server wins)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
    const { result, rerender } = renderTimer(1800);
    act(() => {
      vi.advanceTimersByTime(5 * 60_000);
    });
    // Server says 1498 (client drifted by 2s) → adopt the server value.
    rerender({ s: 1498 });
    expect(result.current.secondsLeft).toBe(1498);
  });
});

describe('Background / tab throttling (reference scenario)', () => {
  it('returning from background reflects real elapsed server time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
    const { result, rerender } = renderTimer(null);
    rerender({ s: 1800 });

    // Student backgrounds the app for 10 minutes; no interval tick is
    // delivered while away (this is what mobile browsers actually do).
    act(() => {
      vi.setSystemTime(new Date(BASE.getTime() + 10 * 60_000));
    });
    // A single tick fires when they return.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // 10 real minutes elapsed → 30:00 − 10:00 = 20:00, minus the one tick.
    expect(result.current.secondsLeft).toBe(1800 - 600 - 1); // 1199
    expect(result.current.formatted).toBe('19:59');
  });
});

describe('Zero + expiry (reference scenario)', () => {
  it('counts to 00:00 and reports expired exactly at the deadline', () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
    const { result } = renderTimer(3);
    expect(result.current.isExpired).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.formatted).toBe('00:02');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.formatted).toBe('00:00');
    expect(result.current.secondsLeft).toBe(0);
    expect(result.current.isExpired).toBe(true); // → page auto-submits
  });

  it('server-expired attempt (seed 0) is immediately zero + expired', () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
    const { result } = renderTimer(0);
    expect(result.current.formatted).toBe('00:00');
    expect(result.current.isExpired).toBe(true);
  });

  it('sub-one-minute seeds format correctly', () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
    const { result } = renderTimer(45);
    expect(result.current.formatted).toBe('00:45');
    act(() => {
      vi.advanceTimersByTime(40_000);
    });
    expect(result.current.formatted).toBe('00:05');
    expect(result.current.isExpired).toBe(false);
  });
});

describe('Invalid data (reference scenario)', () => {
  it('missing seed → 00:00 but NOT expired (no fake expired timer)', () => {
    const { result } = renderTimer(null);
    expect(result.current.formatted).toBe('00:00');
    expect(result.current.isExpired).toBe(false);
    expect(Number.isNaN(result.current.secondsLeft)).toBe(false);
  });

  it('garbage seeds (NaN/Infinity) are ignored, not treated as expired', () => {
    const nan = renderTimer(Number.NaN);
    expect(nan.result.current.isExpired).toBe(false);
    expect(nan.result.current.formatted).toBe('00:00');
    const inf = renderTimer(Number.POSITIVE_INFINITY);
    expect(inf.result.current.isExpired).toBe(false);
    expect(inf.result.current.formatted).toBe('00:00');
  });

  it('negative seeds are clamped to zero (server never sends these)', () => {
    const { result } = renderTimer(-30);
    expect(result.current.secondsLeft).toBe(0);
    expect(result.current.formatted).toBe('00:00');
  });

  it('fractional seeds are floored, not mis-scaled (no ms/s mismatch)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
    const { result } = renderTimer(1799.9);
    expect(result.current.secondsLeft).toBe(1799);
    expect(result.current.formatted).toBe('29:59');
  });
});

describe('Anti-cheating', () => {
  it('rolling the device clock backwards cannot extend the countdown', () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
    const { result } = renderTimer(1800);
    act(() => {
      vi.advanceTimersByTime(60_000); // 29:00
    });
    expect(result.current.secondsLeft).toBe(1740);
    // Student rolls the device clock back 10 minutes.
    act(() => {
      vi.setSystemTime(new Date(BASE.getTime() - 10 * 60_000));
      vi.advanceTimersByTime(1000);
    });
    // Display FREEZES at the last legitimate value (1740) — the countdown
    // can never be wound back up by clock manipulation. The server still
    // enforces the true deadline on every answer/submit regardless.
    expect(result.current.secondsLeft).toBe(1740);
    // Roll even further back: still frozen, never above the seed.
    act(() => {
      vi.setSystemTime(new Date(BASE.getTime() - 60 * 60_000));
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.secondsLeft).toBeLessThanOrEqual(1740);
    expect(result.current.secondsLeft).toBeGreaterThan(0);
  });

  it('re-render storms never restart the countdown', () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
    const { result, rerender } = renderTimer(1800);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    // Parent re-renders repeatedly with the same server value.
    for (let i = 0; i < 5; i += 1) rerender({ s: 1800 });
    expect(result.current.secondsLeft).toBe(1770); // not 1800 again
  });
});
