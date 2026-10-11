import { Flame, Trophy } from "lucide-react";
import { getPrefs } from "@/lib/prefs";
import { computeStreaks, heatmapWeeks, streakLabel } from "@/lib/streaks";
import { addDays, shortDate } from "@/lib/time";
import type { RouteRow } from "@/lib/data";

export function habitStreaks(route: RouteRow, dates: string[] | undefined, today: string) {
  return computeStreaks(dates ?? [], route.habit_frequency, route.habit_target, today, getPrefs().weekStart);
}

export function StreakLine({ route, dates, today, className = "" }: { route: RouteRow; dates: string[] | undefined; today: string; className?: string }) {
  const s = habitStreaks(route, dates, today);
  return (
    <p className={`flex flex-wrap items-center gap-x-3 gap-y-1 meta-text text-muted-foreground ${className}`}>
      <span className="inline-flex items-center gap-1"><Flame className="h-3.5 w-3.5 text-primary-strong" aria-hidden /> Current streak {streakLabel(s.current, s.unit)}</span>
      <span className="inline-flex items-center gap-1"><Trophy className="h-3.5 w-3.5 text-gold-text" aria-hidden /> Best {streakLabel(s.best, s.unit)}</span>
    </p>
  );
}

const longDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Last 26 weeks, one cell per day; checked days filled, today outlined. */
export function HabitHeatmap({ dates, today }: { dates: string[] | undefined; today: string }) {
  const weeks = heatmapWeeks(today, getPrefs().weekStart);
  const set = new Set(dates ?? []);
  const first = weeks[0]![0]!;
  const total = (dates ?? []).filter((d) => d >= first && d <= today).length;
  const dayNames = Array.from({ length: 7 }, (_, i) => new Date(`${addDays(first, i)}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }));
  return (
    <figure className="surface p-4">
      <figcaption className="mb-3 body-text text-muted-foreground">
        {total} check-in{total === 1 ? "" : "s"} in the last 26 weeks
        <span className="sr-only"> ({shortDate(first, today)} to {shortDate(today, today)})</span>
      </figcaption>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <div className="grid shrink-0 grid-rows-7 gap-[3px] meta-text leading-3 text-muted-foreground" aria-hidden>
          {dayNames.map((n, i) => <span key={i} className="h-3">{i % 2 === 0 ? n : ""}</span>)}
        </div>
        <ul className="grid grid-flow-col grid-rows-7 gap-[3px]" aria-label="Daily check-ins, last 26 weeks">
          {weeks.flat().map((d, i) =>
            d ? (
              <li
                key={d}
                role="img"
                aria-label={`${longDate(d)}: ${set.has(d) ? "checked in" : "no check-in"}${d === today ? " (today)" : ""}`}
                className={`h-3 w-3 rounded-[3px] ${set.has(d) ? "bg-primary" : "border border-input bg-muted"} ${d === today ? "outline outline-2 outline-offset-1 outline-foreground" : ""}`}
              />
            ) : (
              <li key={`f${i}`} aria-hidden className="h-3 w-3" />
            ),
          )}
        </ul>
      </div>
      <p className="mt-2 flex items-center gap-2 meta-text text-muted-foreground" aria-hidden>
        <span className="h-3 w-3 rounded-[3px] border border-input bg-muted" /> No check-in
        <span className="ml-2 h-3 w-3 rounded-[3px] bg-primary" /> Checked in
      </p>
    </figure>
  );
}
