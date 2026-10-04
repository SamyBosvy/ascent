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
});
