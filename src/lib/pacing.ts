import { daysBetween, shortDate } from "./time";

export type PacingInput = {
  type: string;
  status: string;
  target_date: string | null;
  summited_at?: string | null;
  current_page: number | null;
  total_pages: number | null;
  milestonesTotal: number;
  milestonesDone: number;
};
export type Pacing = { text: string; tone: "ok" | "due" | "overdue" };

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Pacing line for a route with a target date, or null when there's nothing to pace. */
export function pacing(r: PacingInput, today: string): Pacing | null {
  if (!r.target_date || r.status === "summited" || r.summited_at) return null;
  const daysLeft = daysBetween(today, r.target_date);
  const by = shortDate(r.target_date, today);
  const isBook = r.type === "book" && !!r.total_pages;
  const pagesLeft = isBook ? Math.max(0, r.total_pages! - (r.current_page ?? 0)) : 0;
  const msLeft = Math.max(0, r.milestonesTotal - r.milestonesDone);
  const finished = isBook ? pagesLeft === 0 : r.milestonesTotal > 0 && msLeft === 0;
  if (finished) return null;

  if (daysLeft < 0) return { text: `Overdue by ${plural(-daysLeft, "day")}`, tone: "overdue" };
  if (daysLeft === 0) {
    const rest = isBook ? ` · ${plural(pagesLeft, "page")} left` : msLeft ? ` · ${plural(msLeft, "milestone")} left` : "";
    return { text: `Due today${rest}`, tone: "due" };
  }
  if (isBook) return { text: `${Math.ceil(pagesLeft / daysLeft)} pages/day to finish by ${by}`, tone: "ok" };
  if (r.milestonesTotal > 0) {
    const weeks = Math.max(1, Math.ceil(daysLeft / 7));
    const per = Math.ceil(msLeft / weeks);
    return { text: `${per} milestone${per === 1 ? "" : "s"}/week to finish by ${by}`, tone: "ok" };
  }
  return { text: `${plural(daysLeft, "day")} left · target ${by}`, tone: "ok" };
}
