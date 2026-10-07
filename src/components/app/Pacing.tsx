import { CalendarClock } from "lucide-react";
import { localDate, type RouteAgg, type RouteRow } from "@/lib/data";
import { pacing } from "@/lib/pacing";

export function routePacing(route: RouteRow, agg: RouteAgg | undefined) {
  if (route.type === "habit") return null;
  return pacing({ ...route, milestonesTotal: Number(agg?.milestones_total ?? 0), milestonesDone: Number(agg?.milestones_done ?? 0) }, localDate());
}

export function PacingLine({ route, agg, className = "" }: { route: RouteRow; agg: RouteAgg | undefined; className?: string }) {
  const p = routePacing(route, agg);
  if (!p) return null;
  return (
    <p className={`flex items-center gap-1.5 text-xs ${p.tone === "ok" ? "text-muted-foreground" : "font-medium text-destructive-strong"} ${className}`}>
      <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden /> {p.text}
    </p>
  );
}
