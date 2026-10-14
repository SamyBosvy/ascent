import { afterEach, describe, expect, it, vi } from "vitest";
import { EASE_DELTA, fuzzInterval, schedule, type Rating } from "./srs";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
const now = new Date("2026-10-07T12:00:00Z");
describe("schedule", () => {
  for (const [state, card, intervals, eases] of [
    ["new", { ease: 2.5, interval_days: 0, reps: 0 }, [0, 1, 1, 1], [2.3, 2.35, 2.5, 2.65]],
    ["mature", { ease: 2.5, interval_days: 30, reps: 4 }, [0, 36, 75, 103], [2.3, 2.35, 2.5, 2.65]],
  ] as const) {
    for (const rating of [0, 1, 2, 3] as Rating[]) {
      it(`${state} card, rating ${rating}: ease, interval, reps and exact due time`, () => {
        vi.spyOn(Math, "random").mockReturnValue(0.5);
        vi.useFakeTimers(); vi.setSystemTime(now);
        const next = schedule(card, rating);
        expect(next.ease).toBeCloseTo(eases[rating]);
        expect(next.interval_days).toBe(intervals[rating]);
        expect(next.reps).toBe(rating === 0 ? 0 : card.reps + 1);
        expect(next.due_at).toBe(new Date(now.getTime() + (rating === 0 ? 600000 : intervals[rating] * 86400000)).toISOString());
        expect(card.ease).toBe(2.5);
      });
    }
  }
  it("ease floors at 1.3 under repeated again and hard ratings", () => {
    for (const r of [0, 1] as Rating[]) {
      let c = { ease: 1.4, interval_days: 4, reps: 3 };
      for (let i = 0; i < 30; i++) c = schedule(c, r, now);
      expect(c.ease).toBe(1.3);
    }
  });
  it("preserves uncapped ease: easy adds 0.15 even above 2.5", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    expect(schedule({ ease: 3, interval_days: 1, reps: 0 }, 3, now).ease).toBeCloseTo(3.15);
  });
  it("uses the fixed Anki-style ease deltas from 2.5", () => {
    for (const r of [0, 1, 2, 3] as Rating[])
      expect(schedule({ ease: 2.5, interval_days: 1, reps: 0 }, r, now).ease).toBeCloseTo(2.5 + EASE_DELTA[r]);
    expect(EASE_DELTA).toEqual({ 0: -0.2, 1: -0.15, 2: 0, 3: 0.15 });
  });
  it("floors ease at exactly 1.3 when againing a near-floor card", () => {
    expect(schedule({ ease: 1.35, interval_days: 1, reps: 2 }, 0, now).ease).toBe(1.3);
  });
  it("keeps the step intervals: reps 0 Good = 1, reps 1 Good = 6, reps 1 Hard = 3", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    expect(schedule({ ease: 2.5, interval_days: 0, reps: 0 }, 2, now).interval_days).toBe(1);
    expect(schedule({ ease: 2.5, interval_days: 1, reps: 1 }, 2, now).interval_days).toBe(6);
    expect(schedule({ ease: 2.5, interval_days: 1, reps: 1 }, 1, now).interval_days).toBe(3);
  });
  it("second repetition uses 3 days for hard and 6 for good/easy before fuzz", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    for (const r of [1, 2, 3] as Rating[]) expect(schedule({ ease: 2.5, interval_days: 1, reps: 1 }, r, now).interval_days).toBe(r === 1 ? 3 : 6);
  });
  it("Again is exactly ten minutes, not one day, even for a mature card", () => {
    const next = schedule({ ease: 2.5, interval_days: 365, reps: 20 }, 0, now);
    expect(next.interval_days).toBe(0); expect(next.due_at).toBe("2026-10-07T12:10:00.000Z");
  });
  it("successful ratings never schedule below one day, including a zero-interval mature input", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    for (const r of [1, 2, 3] as Rating[]) expect(schedule({ ease: 1.3, interval_days: 0, reps: 3 }, r, now).interval_days).toBeGreaterThanOrEqual(1);
  });
});
describe("fuzz", () => {
  it.each([0, 1, 2])("does not sample random for interval %i", days => {
    const random = vi.fn(() => 0); expect(fuzzInterval(days, random)).toBe(days); expect(random).not.toHaveBeenCalled();
  });
  it.each([3, 4, 6, 20, 30, 75, 365, 1000])("inclusive bounds for %i days", days => {
    const spread = Math.max(1, Math.round(days * 0.05));
    expect(fuzzInterval(days, () => 0)).toBe(Math.max(1, days - spread));
    expect(fuzzInterval(days, () => 1 - Number.EPSILON)).toBe(days + spread);
    for (let i = 0; i < 100; i++) {
      const n = fuzzInterval(days, () => i / 100);
      expect(n).toBeGreaterThanOrEqual(Math.max(1, days - spread)); expect(n).toBeLessThanOrEqual(days + spread); expect(Number.isInteger(n)).toBe(true);
    }
  });
});