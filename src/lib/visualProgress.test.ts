import { describe, it, expect } from 'vitest';
import { activityBuckets, activityLabel, CAMP_SCORES, claimSummit, climberPosition, onboardingStep, summitSeenKey } from './visualProgress';
import type { RouteRow, RouteAgg } from './data';
const route = { id: 'route', type: 'skill' } as RouteRow;
describe('continuous climber', () => {
  it.each(CAMP_SCORES.map((score, i) => [score, i]))('lands on score %s at camp %s', (score, i) => {
    expect(climberPosition(score).current).toBe(i);
    expect(climberPosition(score).y).toBe(284 - i * 65);
  });
  it('interpolates both coordinates between camps', () => {
    expect(climberPosition(0.275)).toEqual({ x: 95, y: 186.5, current: 1, next: 2 });
  });
  it('clamps invalid and out-of-range values', () => {
    expect(climberPosition(-1)).toEqual(climberPosition(0));
    expect(climberPosition(NaN)).toEqual(climberPosition(0));
    expect(climberPosition(4)).toEqual(climberPosition(0.9));
  });
  it('is continuous at thresholds', () => { for (const score of CAMP_SCORES.slice(1)) expect(Math.abs(climberPosition(score).y - climberPosition(score - 1e-9).y)).toBeLessThan(0.001); });
});
describe('seven-day activity', () => {
  it('includes zero days and excludes outside events', () => {
    const days = activityBuckets('2026-10-08', 'UTC', 1, [{ at: '2026-10-01', kind: 'reviews', amount: 9 }, { at: '2026-10-09', kind: 'minutes', amount: 50 }]);
    expect(days).toHaveLength(7); expect(days[0]?.day).toBe('2026-10-02'); expect(days[6]?.day).toBe('2026-10-08'); expect(days.reduce((n, d) => n + d.reviews + d.minutes, 0)).toBe(0);
  });
  it('buckets midnight crossings in the chosen timezone', () => {
    const days = activityBuckets('2026-10-08', 'Europe/Paris', 1, [{ at: '2026-10-07T23:30:00Z', kind: 'reviews', amount: 3 }, { at: '2026-10-08', kind: 'checkins', amount: 1 }]);
    expect(days[6]?.reviews).toBe(3); expect(days[6]?.checkins).toBe(1);
  });
  it.each([0, 1] as const)('keeps rolling dates with week start %s', ws => {
    const days = activityBuckets('2026-10-05', 'UTC', ws, []);
    expect(days[0]?.day).toBe('2026-09-29'); expect(days[5]?.week).toBe(ws === 0 ? '2026-10-04' : '2026-09-28');
  });
  it('handles DST and month/year edges', () => {
    const days = activityBuckets('2027-01-01', 'America/New_York', 0, [{ at: '2027-01-01T02:00:00Z', kind: 'minutes', amount: 25 }]);
    expect(days[5]?.day).toBe('2026-12-31'); expect(days[5]?.minutes).toBe(25);
    expect(activityBuckets('2026-03-09', 'America/New_York', 1, [{ at: '2026-03-09T03:30:00Z', kind: 'reviews', amount: 2 }])[5]?.reviews).toBe(2);
  });
});
describe('first run', () => {
  it('offers creation for zero routes only if not dismissed', () => { expect(onboardingStep([], new Map(), null, null)).toBe(1); expect(onboardingStep([], new Map(), null, 'done')).toBeNull(); });
  it('does not show for existing-route accounts', () => expect(onboardingStep([route], new Map(), null, null)).toBeNull());
  it('resumes explicitly started guidance until a card exists', () => {
    expect(onboardingStep([route], new Map(), 'started', null)).toBe(2);
    expect(onboardingStep([route], new Map([['route', { cards_total: 1 } as RouteAgg]]), 'started', null)).toBe(3);
  });
  it('stays hidden after explicit dismissal', () => expect(onboardingStep([route], new Map(), 'started', 'done')).toBeNull());
});
describe('summit seen once', () => {
  it('claims only once across remounts', () => { const map = new Map<string, string>(); const store = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); } }; const key = summitSeenKey('u', 'r', 'date'); expect(claimSummit(store, key)).toBe(true); expect(claimSummit(store, key)).toBe(false); });
  it('scopes separate users, routes and repeat summits', () => { const key = summitSeenKey('u', 'r', 'date'); expect(summitSeenKey('v', 'r', 'date')).not.toBe(key); expect(summitSeenKey('u', 's', 'date')).not.toBe(key); expect(summitSeenKey('u', 'r', 'later')).not.toBe(key); });
});
describe('relative activity', () => {
  it('never substitutes route creation for activity', () => expect(activityLabel(null, '2026-10-08', 'UTC')).toBe('No activity yet'));
  it('uses local calendar days', () => expect(activityLabel('2026-10-06T23:30:00Z', '2026-10-08', 'Europe/Paris')).toBe('Last activity: yesterday'));
});