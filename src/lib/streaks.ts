import { addDays, daysBetween, weekStartOf, type WeekStart } from "./time";

export type Frequency = "daily" | "weekly" | "x_per_week";
export type Streaks = { current: number; best: number; unit: "day" | "week" };

/**
 * Current and best streaks from check-in dates (YYYY-MM-DD, user timezone).
 * daily: consecutive days; today unchecked doesn't break the streak yet.
 * weekly / x_per_week: consecutive weeks meeting the target; the current week
 * counts once met and doesn't break the streak while it's still open.
 */
export function computeStreaks(dates: string[], freq: Frequency | string | null, target: number | null, today: string, ws: WeekStart): Streaks {
  const days = [...new Set(dates.filter((d) => d <= today))].sort();
  if (freq !== "weekly" && freq !== "x_per_week") {
    const set = new Set(days);
    let current = 0;
    for (let d = set.has(today) ? today : addDays(today, -1); set.has(d); d = addDays(d, -1)) current++;
    let best = 0, run = 0, prev: string | null = null;
    for (const d of days) {
      run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
      best = Math.max(best, run);
      prev = d;
    }
    return { current, best: Math.max(best, current), unit: "day" };
  }
  const need = freq === "weekly" ? 1 : Math.max(1, target ?? 3);
  const counts = new Map<string, number>();
  for (const d of days) {
    const w = weekStartOf(d, ws);
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const met = (w: string) => (counts.get(w) ?? 0) >= need;
  const thisWeek = weekStartOf(today, ws);
  let current = 0;
  for (let w = met(thisWeek) ? thisWeek : addDays(thisWeek, -7); met(w); w = addDays(w, -7)) current++;
  let best = 0, run = 0;
  if (days.length) {
    for (let w = weekStartOf(days[0]!, ws); w <= thisWeek; w = addDays(w, 7)) {
      if (met(w)) run++;
      else if (w !== thisWeek) run = 0;
      best = Math.max(best, run);
    }
  }
  return { current, best: Math.max(best, current), unit: "week" };
}

export const streakLabel = (n: number, unit: "day" | "week") => `${n} ${unit}${n === 1 ? "" : "s"}`;

/** Last `weeks` weeks of days for a heatmap, as columns (weeks) of 7 dates; future days are null. */
export function heatmapWeeks(today: string, ws: WeekStart, weeks = 26): (string | null)[][] {
  const first = addDays(weekStartOf(today, ws), -(weeks - 1) * 7);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => {
      const d = addDays(first, w * 7 + i);
      return d <= today ? d : null;
    }),
  );
}
