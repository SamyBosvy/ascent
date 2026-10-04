import { localDate, startOfWeek, type AllData, type RouteRow } from "./data";

export const CAMPS = ["Base Camp", "Camp 1", "Camp 2", "Camp 3", "Summit"] as const;

export function habitConsistency(route: RouteRow, data: AllData) {
  const since = new Date();
  since.setDate(since.getDate() - 29);
  const sinceStr = localDate(since);
  const count = data.checkins.filter((c) => c.route_id === route.id && c.checked_on >= sinceStr).length;
  const freq = route.habit_frequency ?? "daily";
  const expected = freq === "daily" ? 30 : freq === "weekly" ? 30 / 7 : ((route.habit_target ?? 3) * 30) / 7;
  return Math.min(1, count / expected);
}

export function habitDueToday(route: RouteRow, data: AllData) {
  const today = localDate();
  const mine = data.checkins.filter((c) => c.route_id === route.id);
  if (mine.some((c) => c.checked_on === today)) return false;
  const freq = route.habit_frequency ?? "daily";
  if (freq === "daily") return true;
  const wk = localDate(startOfWeek());
  const thisWeek = mine.filter((c) => c.checked_on >= wk).length;
  return thisWeek < (freq === "weekly" ? 1 : route.habit_target ?? 3);
}

export function routeStats(route: RouteRow, data: AllData) {
  const ms = data.milestones.filter((m) => m.route_id === route.id);
  const done = ms.filter((m) => m.done).length;
  const minutes = data.sessions.filter((s) => s.route_id === route.id).reduce((a, s) => a + s.minutes, 0);
  const cards = data.cards.filter((c) => c.route_id === route.id);
  const since = Date.now() - 30 * 86400000;
  const recent = data.reviews.filter((r) => r.route_id === route.id && new Date(r.reviewed_at).getTime() > since);
  const retention = recent.length ? recent.filter((r) => r.rating >= 2).length / recent.length : null;
  const mature = cards.length ? cards.filter((c) => c.interval_days >= 21).length / cards.length : null;

  const parts: [number, number][] = [];
  if (route.type === "habit") parts.push([habitConsistency(route, data), 0.5]);
  else if (ms.length) parts.push([done / ms.length, 0.5]);
  else if (route.total_pages) parts.push([Math.min(1, (route.current_page ?? 0) / route.total_pages), 0.5]);
  parts.push([Math.min(1, minutes / 1200), 0.2]);
  if (cards.length) parts.push([0.5 * (mature ?? 0) + 0.5 * (retention ?? 0), 0.3]);
  const w = parts.reduce((a, [, x]) => a + x, 0);
  const score = parts.reduce((a, [v, x]) => a + v * x, 0) / w;
  const calculated = score >= 0.9 ? 4 : score >= 0.65 ? 3 : score >= 0.4 ? 2 : score >= 0.15 ? 1 : 0;
  const camp = route.camp_override ?? calculated;

  const times = [
    route.created_at,
    ...data.sessions.filter((s) => s.route_id === route.id).map((s) => s.logged_at),
    ...recent.map((r) => r.reviewed_at),
    ...ms.filter((m) => m.done_at).map((m) => m.done_at!),
    ...data.checkins.filter((c) => c.route_id === route.id).map((c) => c.checked_on),
  ];
  const lastActivity = times.sort().at(-1)!;
  return { score, calculated, camp, done, total: ms.length, minutes, cards: cards.length, retention, lastActivity };
}
