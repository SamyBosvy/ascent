import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

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

export const routesQuery = {
  queryKey: ["routes"],
  queryFn: () => fetchPaged<RouteRow>((a, b) => supabase.from("routes").select("*").order("created_at").order("id").range(a, b)),
};
export function useRoutes() {
  return useQuery(routesQuery);
}

/** Per-route aggregates (milestones, minutes, cards, recent reviews, check-ins), computed in the database under RLS. */
export function useRouteStats() {
  return useQuery({
    queryKey: ["route-stats"],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 29);
      const rows = await must(
        supabase.rpc("route_stats", {
          _since_date: localDate(since),
          _since_ts: new Date(Date.now() - 30 * 86400000).toISOString(),
          _week_date: localDate(startOfWeek()),
          _today: localDate(),
        }),
      );
      return new Map((rows ?? []).map((r) => [r.route_id, r]));
    },
  });
}

export function useDueCount() {
  return useQuery({
    queryKey: ["cards", "due-count"],
    queryFn: async () => {
      const { count, error } = await supabase.from("cards").select("id", { count: "exact", head: true }).lte("due_at", new Date().toISOString());
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });
}

export function useWeekMinutes() {
  return useQuery({
    queryKey: ["sessions", "week-minutes"],
    queryFn: async () => Number(await must(supabase.rpc("minutes_since", { _since: startOfWeek().toISOString() }))),
  });
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

export function startOfWeek(d = new Date()) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday start
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

export function localDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
