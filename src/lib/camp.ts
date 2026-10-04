import type { RouteAgg, RouteRow } from "./data";

export const CAMPS = ["Base Camp", "Camp 1", "Camp 2", "Camp 3", "Summit"] as const;

// Aggregates come from the route_stats database function (see useRouteStats).
// Formula is unchanged from the original in-memory version.
const n = (v: number | null | undefined) => Number(v ?? 0);

export function habitConsistency(route: RouteRow, agg: RouteAgg | undefined) {
  const count = n(agg?.checkins_recent);
  const freq = route.habit_frequency ?? "daily";
  // Window = last 30 days, or since the habit started if it's younger (today counts as day 1).
  const start = new Date(route.created_at);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.max(1, Math.min(30, Math.round((today.getTime() - start.getTime()) / 86400000) + 1));
  const expected = freq === "daily" ? days : freq === "weekly" ? days / 7 : ((route.habit_target ?? 3) * days) / 7;
  return Math.min(1, count / expected);
}

export function habitDueToday(route: RouteRow, agg: RouteAgg | undefined) {
  if (agg?.checked_today) return false;
  const freq = route.habit_frequency ?? "daily";
  if (freq === "daily") return true;
  return n(agg?.checkins_week) < (freq === "weekly" ? 1 : route.habit_target ?? 3);
}

export function routeStats(route: RouteRow, agg: RouteAgg | undefined) {
  const total = n(agg?.milestones_total);
  const done = n(agg?.milestones_done);
  const minutes = n(agg?.minutes);
  const cards = n(agg?.cards_total);
  const recentN = n(agg?.reviews_recent);
  const retention = recentN ? n(agg?.reviews_recent_good) / recentN : null;
  const mature = cards ? n(agg?.cards_mature) / cards : null;

  const parts: [number, number][] = [];
  if (route.type === "habit") parts.push([habitConsistency(route, agg), 0.5]);
  else if (total) parts.push([done / total, 0.5]);
  else if (route.total_pages) parts.push([Math.min(1, (route.current_page ?? 0) / route.total_pages), 0.5]);
  parts.push([Math.min(1, minutes / 1200), 0.2]);
  if (cards) parts.push([0.5 * (mature ?? 0) + 0.5 * (retention ?? 0), 0.3]);
  const w = parts.reduce((a, [, x]) => a + x, 0);
  const score = parts.reduce((a, [v, x]) => a + v * x, 0) / w;
  const calculated = score >= 0.9 ? 4 : score >= 0.65 ? 3 : score >= 0.4 ? 2 : score >= 0.15 ? 1 : 0;
  const camp = route.camp_override ?? calculated;

  const times = [route.created_at, agg?.last_session_at, agg?.last_review_at, agg?.last_milestone_at, agg?.last_checkin_on].filter(
    (t): t is string => !!t,
  );
  const lastActivity = times.sort().at(-1)!;
  return { score, calculated, camp, done, total, minutes, cards, due: n(agg?.cards_due), retention, lastActivity };
}
