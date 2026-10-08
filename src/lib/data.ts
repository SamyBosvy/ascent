import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { getPrefs, type Theme } from "./prefs";
import { addDays, browserTimeZone, dateInZone, weekStartOf, zonedMidnight, type WeekStart } from "./time";
import { activityBuckets, type ActivityDay } from './visualProgress';

type T = Database["public"]["Tables"];
export type RouteRow = T["routes"]["Row"];
export type Milestone = T["milestones"]["Row"];
export type Session = T["sessions"]["Row"];
export type Note = T["notes"]["Row"];
export type Card = T["cards"]["Row"];
export type Review = T["reviews"]["Row"];
export type Checkin = T["checkins"]["Row"];
export type RouteType = Database["public"]["Enums"]["route_type"];
export type RouteStatus = Database["public"]["Enums"]["route_status"];
export type RouteAgg = Database["public"]["Functions"]["route_stats"]["Returns"][number];

export const TYPE_LABEL: Record<RouteType, string> = {
  book: "Book",
  language: "Language",
  skill: "Skill / Framework",
  course: "Course",
  paper: "Paper",
  habit: "Habit",
};
export const STATUS_LABEL: Record<RouteStatus, string> = {
  active: "Active",
  paused: "Paused",
  summited: "Summited",
  abandoned: "Abandoned",
};

async function must<R>(p: PromiseLike<{ data: R | null; error: { message: string } | null }>) {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as R;
}
export { must };

const PAGE = 1000;
/** Fetch every row of a query in 1,000-row pages so nothing is silently truncated. */
export async function fetchPaged<R>(
  build: (from: number, to: number) => PromiseLike<{ data: R[] | null; error: { message: string } | null }>,
): Promise<R[]> {
  const out: R[] = [];
  for (let from = 0; ; from += PAGE) {
    const rows = await must(build(from, from + PAGE - 1));
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

// ---------- per-screen queries ----------
export function useActivityStrip() {
  const today = localDate();
  const prefs = getPrefs();
  return useQuery({
    queryKey: ['activity-strip', today, prefs.tz, prefs.weekStart],
    queryFn: async (): Promise<ActivityDay[]> => {
      const rows = await must(supabase.rpc('activity_strip', { _today: today, _timezone: prefs.tz }));
      return activityBuckets(today, prefs.tz, prefs.weekStart, rows.flatMap(r => [
        { at: r.day, kind: 'reviews' as const, amount: Number(r.reviews) },
        { at: r.day, kind: 'minutes' as const, amount: Number(r.minutes) },
        { at: r.day, kind: 'checkins' as const, amount: Number(r.checkins) },
      ]));
    },
  });
}

export const routesQuery = {
  queryKey: ["routes"],
  queryFn: () => fetchPaged<RouteRow>((a, b) => supabase.from("routes").select("*").is("deleted_at", null).order("created_at").order("id").range(a, b)),
};
export function useRoutes() {
  return useQuery(routesQuery);
}

/** Per-route aggregates (milestones, minutes, cards, recent reviews, check-ins), computed in the database under RLS. */
export function useRouteStats() {
  return useQuery({
    queryKey: ["route-stats"],
    queryFn: async () => {
      const today = localDate();
      const rows = await must(
        supabase.rpc("route_stats", {
          _since_date: addDays(today, -29),
          _since_ts: new Date(Date.now() - 30 * 86400000).toISOString(),
          _week_date: weekStartDate(),
          _today: today,
        }),
      );
      return new Map((rows ?? []).map((r) => [r.route_id, r]));
    },
  });
}

/** Due cards split into reviews (seen before) and new cards; same filters as the Review queue. */
export function useDueCounts() {
  return useQuery({
    queryKey: ["cards", "due-count"],
    queryFn: async () => {
      const count = async (isNew: boolean) => {
        let q = supabase
          .from("cards")
          .select("id, routes!inner(id)", { count: "exact", head: true })
          .is("routes.archived_at", null)
          .is("routes.deleted_at", null)
          .is("suspended_at", null)
          .or(`buried_until.is.null,buried_until.lte.${localDate()}`)
          .lte("due_at", new Date().toISOString());
        q = isNew ? q.is("last_reviewed_at", null) : q.not("last_reviewed_at", "is", null);
        const { count: n, error } = await q;
        if (error) throw new Error(error.message);
        return n ?? 0;
      };
      const [reviews, fresh] = await Promise.all([count(false), count(true)]);
      return { reviews, fresh };
    },
  });
}

export function useWeekMinutes() {
  return useQuery({
    queryKey: ["sessions", "week-minutes"],
    queryFn: async () => Number(await must(supabase.rpc("minutes_since", { _since: startOfWeek().toISOString() }))),
  });
}

/** Routes still on the mountain: not archived (deleted ones are already excluded by routesQuery). */
export const isLive = (r: RouteRow) => !r.archived_at;

export const DEFAULT_NEW_PER_DAY = 20;
export type UserSettings = { new_per_day: number; theme: Theme; week_start: WeekStart; timezone: string; timezone_set: boolean; daily_goal: number | null; exists: boolean };
/** The user's settings with defaults filled in; a row is only created on the first save. */
export function useUserSettings() {
  return useQuery({
    queryKey: ["user-settings", "all"],
    queryFn: async (): Promise<UserSettings> => {
      const row = await must<{ new_per_day: number; theme: string; week_start: number; timezone: string | null; daily_goal: number | null } | null>(
        supabase.from("user_settings").select("new_per_day, theme, week_start, timezone, daily_goal").maybeSingle(),
      );
      return {
        new_per_day: row?.new_per_day ?? DEFAULT_NEW_PER_DAY,
        theme: row?.theme === "light" || row?.theme === "dark" ? row.theme : "system",
        week_start: row?.week_start === 0 ? 0 : 1,
        timezone: row?.timezone || browserTimeZone(),
        timezone_set: !!row?.timezone,
        daily_goal: row?.daily_goal ?? null,
        exists: !!row,
      };
    },
  });
}
export function useNewPerDay() {
  const q = useUserSettings();
  return { ...q, data: q.data?.new_per_day };
}
export function startOfToday() {
  return zonedMidnight(localDate(), getPrefs().tz);
}
/** Reviews recorded today (user timezone); cram records none. */
export function useReviewsToday() {
  return useQuery({
    queryKey: ["reviews", "today-count"],
    queryFn: async () => {
      const { count, error } = await supabase.from("reviews").select("id", { count: "exact", head: true }).gte("reviewed_at", startOfToday().toISOString());
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });
}
/** New cards (never reviewed before) whose first review happened today. */
export function useNewReviewedToday() {
  return useQuery({
    queryKey: ["reviews", "new-today"],
    queryFn: async () => Number(await must(supabase.rpc("new_cards_reviewed_since", { _since: startOfToday().toISOString() }))),
  });
}
export type CardState = "new" | "due" | "suspended" | "buried" | "scheduled";
export function cardState(c: Card): CardState {
  if (c.suspended_at) return "suspended";
  if (c.buried_until && c.buried_until > localDate()) return "buried";
  if (!c.last_reviewed_at) return "new";
  if (new Date(c.due_at).getTime() <= Date.now()) return "due";
  return "scheduled";
}

export function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

// ---------- formatting ----------

export function minutesLabel(m: number) {
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r ? `${h}h ${r}m` : `${h}h`;
}

/** First day of the current week (user week start), as YYYY-MM-DD. */
export function weekStartDate(d = new Date()) {
  return weekStartOf(localDate(d), getPrefs().weekStart);
}
/** Instant the week containing `d` starts, in the user's timezone and week start. */
export function startOfWeek(d = new Date()) {
  return zonedMidnight(weekStartDate(d), getPrefs().tz);
}

/** Calendar date in the user's timezone. */
export function localDate(d = new Date()) {
  return dateInZone(d, getPrefs().tz);
}

/** Every check-in date per route (paged past 1,000 rows), for streaks and the heatmap. */
export function useCheckinHistory(routeId?: string, enabled = true) {
  return useQuery({
    queryKey: ["checkins", "history", routeId ?? "all"],
    enabled,
    queryFn: async () => {
      const rows = await fetchPaged<{ route_id: string; checked_on: string }>((a, b) => {
        let q = supabase.from("checkins").select("route_id, checked_on, routes!inner(id)").is("routes.deleted_at", null).eq("routes.type", "habit");
        if (routeId) q = q.eq("route_id", routeId);
        return q.order("checked_on").order("id").range(a, b);
      });
      const map = new Map<string, string[]>();
      for (const r of rows) map.set(r.route_id, [...(map.get(r.route_id) ?? []), r.checked_on]);
      return map;
    },
  });
}
