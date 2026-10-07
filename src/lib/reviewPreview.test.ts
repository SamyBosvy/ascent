import { describe, it, expect, vi } from 'vitest';
import { previewSchedules, intervalLabel } from './reviewPreview';
describe('review previews', () => {
  it('samples once for all ratings and keeps their exact due times', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    const now = new Date('2026-10-04T10:00:00Z');
    const previews = previewSchedules({ ease: 2.5, interval_days: 30, reps: 4 }, now);
    expect(random).toHaveBeenCalledTimes(3);
    random.mockReturnValue(1);
    expect(previews[2].interval_days).toBe(71);
    expect(previews[2].due_at).toBe(new Date(now.getTime() + 71 * 86400000).toISOString());
    expect(intervalLabel(previews[0])).toBe('10m');
    expect(intervalLabel(previews[0], new Date(now.getTime() + 9.5 * 60000))).toBe('<1m');
    random.mockRestore();
  });
  it('formats days, weeks, months and years', () => {
    const base = { ease: 2.5, reps: 1, due_at: '2026-10-04T10:00:00Z' };
    for (const [days, label] of [[1, '1d'], [4, '4d'], [21, '3w'], [60, '2mo'], [438, '1.2y']] as const) expect(intervalLabel({ ...base, interval_days: days })).toBe(label);
  });
  it('handles minute boundaries, expired steps and crossing midnight', () => {
    const next = { ease: 2.5, reps: 0, interval_days: 0, due_at: '2026-10-08T00:05:00Z' };
    expect(intervalLabel(next, new Date('2026-10-07T23:55:00Z'))).toBe('10m');
    expect(intervalLabel(next, new Date('2026-10-08T00:04:00Z'))).toBe('1m');
    expect(intervalLabel(next, new Date('2026-10-08T00:04:01Z'))).toBe('<1m');
    expect(intervalLabel(next, new Date('2026-10-08T00:06:00Z'))).toBe('<1m');
  });
  it('formats unit transitions without trailing decimal zero', () => {
    for (const [days, expected] of [[20, '20d'], [21, '3w'], [59, '8w'], [60, '2mo'], [364, '12mo'], [365, '1y'], [730, '2y']] as const) {
      expect(intervalLabel({ ease: 2.5, reps: 1, interval_days: days, due_at: '' })).toBe(expected);
    }
  });
});
