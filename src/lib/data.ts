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

export type AllData = {
  routes: RouteRow[];
  milestones: Milestone[];
  sessions: Session[];
  cards: Card[];
  reviews: Review[];
  checkins: Checkin[];
};

async function must<R>(p: PromiseLike<{ data: R | null; error: { message: string } | null }>) {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as R;
}

export async function fetchAll(): Promise<AllData> {
  const [routes, milestones, sessions, cards, reviews, checkins] = await Promise.all([
    must(supabase.from("routes").select("*").order("created_at")),
    must(supabase.from("milestones").select("*").order("position")),
    must(supabase.from("sessions").select("*").order("logged_at", { ascending: false })),
    must(supabase.from("cards").select("*").order("created_at")),
    must(supabase.from("reviews").select("*").order("reviewed_at")),
    must(supabase.from("checkins").select("*")),
  ]);
  return { routes, milestones, sessions, cards, reviews, checkins } as AllData;
}

export function useAll() {
  return useQuery({ queryKey: ["all"], queryFn: fetchAll });
}

export function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

export { must };

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
