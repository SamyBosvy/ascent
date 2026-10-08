import type { RouteAgg, RouteRow } from './data';
import { addDays, dateInZone, daysBetween, weekStartOf, type WeekStart } from './time';

export const CAMP_SCORES = [0, 0.15, 0.4, 0.65, 0.9] as const;
const XS = [70, 110, 80, 120, 100];
export function climberPosition(score: number) {
  const value = Number.isFinite(score) ? Math.max(0, Math.min(0.9, score)) : 0;
  let current = 0;
  while (current < 4 && value >= (CAMP_SCORES[current + 1] ?? 1)) current++;
  const start = CAMP_SCORES[current] ?? 0;
  const end = CAMP_SCORES[current + 1] ?? start;
  const fraction = end > start ? (value - start) / (end - start) : 0;
  const x = (XS[current] ?? 100) + ((XS[current + 1] ?? 100) - (XS[current] ?? 100)) * fraction;
  return { x, y: 290 - (current + fraction) * 65 - 6, current, next: Math.min(4, current + 1) };
}
export function lastRouteActivity(route: RouteRow, agg?: RouteAgg) {
  const times = [agg?.last_session_at, agg?.last_review_at, agg?.last_milestone_at, agg?.last_checkin_on, route.type === 'book' && route.current_page ? route.updated_at : null].filter((v): v is string => !!v);
  return times.sort().at(-1) ?? null;
}
export function activityLabel(at: string | null, today: string, tz: string) {
  if (!at) return 'No activity yet';
  const day = at.length === 10 ? at : dateInZone(new Date(at), tz);
  const days = Math.max(0, daysBetween(day, today));
  return `Last activity: ${days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`}`;
}
export type ActivityDay = { day: string; reviews: number; minutes: number; checkins: number };
export function activityBuckets(today: string, tz: string, ws: WeekStart, events: { at: string; kind: 'reviews' | 'minutes' | 'checkins'; amount: number }[]) {
  const days = Array.from({ length: 7 }, (_, i) => ({ day: addDays(today, i - 6), reviews: 0, minutes: 0, checkins: 0, week: weekStartOf(addDays(today, i - 6), ws) }));
  for (const event of events) {
    const day = event.at.length === 10 ? event.at : dateInZone(new Date(event.at), tz);
    const bucket = days.find(d => d.day === day);
    if (bucket) bucket[event.kind] += event.amount;
  }
  return days;
}
export function onboardingStep(routes: RouteRow[], stats: Map<string, RouteAgg>, started: string | null, done: string | null) {
  if (done || (routes.length > 0 && !started)) return null;
  if (!routes.length) return 1;
  const first = routes[0];
  if (!first) return 1;
  return (stats.get(first.id)?.cards_total ?? 0) > 0 ? 3 : 2;
}
export const summitSeenKey = (userId: string, routeId: string, at: string) => `ascent:summit-seen:${userId}:${routeId}:${at}`;
export function claimSummit(storage: Pick<Storage, 'getItem' | 'setItem'>, key: string) {
  if (storage.getItem(key)) return false;
  storage.setItem(key, '1');
  return true;
}