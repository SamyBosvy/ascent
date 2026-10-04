import { createFileRoute, Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { Check } from "lucide-react";
import { toggleCheckin } from "@/lib/checkins";
import { isLive, minutesLabel, useDueCounts, useNewPerDay, useNewReviewedToday, useRefresh, useRouteStats, useRoutes, useWeekMinutes } from "@/lib/data";
import { habitConsistency, habitDueToday, routeStats } from "@/lib/camp";
import { AltitudeBar, CampBadge } from "@/components/app/Mountain";
import { Empty, SectionTitle } from "@/components/app/fields";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/today")({
  head: () => ({ meta: [{ title: "Today — Ascent" }, { name: "description", content: "Your reviews, habits and routes for today." }, { property: "og:title", content: "Today — Ascent" }, { property: "og:description", content: "Your reviews, habits and routes for today." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Today,
});

function Today() {
  const { data: allRoutes } = useRoutes();
  const routes = allRoutes?.filter(isLive);
  const { data: stats } = useRouteStats();
  const { data: dueCounts } = useDueCounts();
  const { data: newPerDay } = useNewPerDay();
  const { data: newToday } = useNewReviewedToday();
  // Same number Review shows: due reviews + new cards up to what's left of today's new-card limit.
  const due = dueCounts && newPerDay != null && newToday != null ? dueCounts.reviews + Math.min(dueCounts.fresh, Math.max(0, newPerDay - newToday)) : null;
  const { data: weekMinutes } = useWeekMinutes();
  const refresh = useRefresh();
  if (!routes || !stats || due == null || weekMinutes == null) return <p className="text-muted-foreground">Loading…</p>;

  const habits = routes.filter((r) => r.type === "habit" && r.status === "active");
  const dueHabits = habits.filter((h) => habitDueToday(h, stats.get(h.id)));
  const active = routes.filter((r) => r.status === "active" && r.type !== "habit");

  const toggle = (routeId: string, checked: boolean) => toggleCheckin(routeId, checked, refresh);

  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
        <h1 className="mt-1 text-3xl font-semibold">{greeting}.</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="surface flex flex-col justify-between gap-4 p-5">
          <div>
            <p className="text-sm text-muted-foreground">Flashcards due</p>
            <p className="mt-1 font-display text-4xl font-semibold">{due}</p>
            <p className="mt-1 text-sm text-muted-foreground">{due ? `${due} card${due > 1 ? "s" : ""} due. Keep climbing.` : "Nothing due. Clear skies."}</p>
          </div>
          {due ? (
            <Button asChild className="h-12">
              <Link to="/review">Start review</Link>
            </Button>
          ) : (
            <Button className="h-12" disabled>Start review</Button>
          )}
        </div>
        <div className="surface p-5">
          <p className="text-sm text-muted-foreground">Time logged this week</p>
          <p className="mt-1 font-display text-4xl font-semibold">{minutesLabel(weekMinutes)}</p>
          <p className="mt-1 text-sm text-muted-foreground">Since Monday.</p>
        </div>
      </div>

      <section>
        <SectionTitle>Habits today</SectionTitle>
        {habits.length === 0 ? (
          <Empty>No habits yet. Create a Habit route to check in daily.</Empty>
        ) : (
          <ul className="space-y-2">
            {habits.map((h) => {
              const isDue = dueHabits.includes(h);
              const checkedToday = !!stats.get(h.id)?.checked_today;
              return (
                <li key={h.id} className="surface flex items-center gap-3 p-3 pl-4">
                  <Link to="/routes/$id" params={{ id: h.id }} className="min-w-0 flex-1">
                    <p className="truncate font-medium">{h.name}</p>
                    <p className="text-xs text-muted-foreground">{Math.round(habitConsistency(h, stats.get(h.id)) * 100)}% over the last 30 days</p>
                  </Link>
                  {checkedToday ? (
                    <Button onClick={() => toggle(h.id, true)} variant="ghost" className="h-12 px-3 text-primary-strong" aria-label="Checked in today. Tap to undo.">
                      <Check className="h-4 w-4" /> Done
                    </Button>
                  ) : isDue ? (
                    <Button onClick={() => toggle(h.id, false)} variant="outline" className="h-12 px-4">
                      <Check className="h-4 w-4" /> Check in
                    </Button>
                  ) : (
                    <span className="flex h-12 items-center gap-1 px-3 text-sm text-primary-strong"><Check className="h-4 w-4" /> Done</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle action={<Link to="/routes" className="text-sm text-primary-strong">All routes</Link>}>Active routes</SectionTitle>
        {active.length === 0 ? (
          <Empty>
            No active routes. <Link to="/routes" className="text-primary-strong underline">Start your first climb</Link>.
          </Empty>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {active.map((r) => {
              const s = routeStats(r, stats.get(r.id));
              return (
                <li key={r.id}>
                  <Link to="/routes/$id" params={{ id: r.id }} className="surface block space-y-3 p-4 transition-colors hover:border-primary/50">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{r.name}</p>
                      <CampBadge camp={s.camp} />
                    </div>
                    <AltitudeBar camp={s.camp} />
                    <p className="text-xs text-muted-foreground">Last activity {formatDistanceToNow(new Date(s.lastActivity), { addSuffix: true })}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
