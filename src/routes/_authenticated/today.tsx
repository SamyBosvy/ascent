import { createFileRoute, Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { localDate, minutesLabel, startOfWeek, useAll, useRefresh } from "@/lib/data";
import { habitConsistency, habitDueToday, routeStats } from "@/lib/camp";
import { AltitudeBar, CampBadge } from "@/components/app/Mountain";
import { Empty, SectionTitle } from "@/components/app/fields";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/today")({
  head: () => ({ meta: [{ title: "Today — Ascent" }, { name: "description", content: "Your reviews, habits and routes for today." }] }),
  component: Today,
});

function Today() {
  const { data, isLoading } = useAll();
  const refresh = useRefresh();
  if (isLoading || !data) return <p className="text-muted-foreground">Loading…</p>;

  const now = Date.now();
  const due = data.cards.filter((c) => new Date(c.due_at).getTime() <= now).length;
  const habits = data.routes.filter((r) => r.type === "habit" && r.status === "active");
  const dueHabits = habits.filter((h) => habitDueToday(h, data));
  const active = data.routes.filter((r) => r.status === "active" && r.type !== "habit");
  const weekStart = startOfWeek().getTime();
  const weekMinutes = data.sessions.filter((s) => new Date(s.logged_at).getTime() >= weekStart).reduce((a, s) => a + s.minutes, 0);

  async function checkIn(routeId: string) {
    const { error } = await supabase.from("checkins").insert({ route_id: routeId, checked_on: localDate() });
    if (error) return toast.error(error.message);
    toast.success("Checked in.");
    refresh();
  }

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
          <Button asChild className="h-12" disabled={!due}>
            <Link to="/review">Start review</Link>
          </Button>
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
              return (
                <li key={h.id} className="surface flex items-center gap-3 p-3 pl-4">
                  <Link to="/routes/$id" params={{ id: h.id }} className="min-w-0 flex-1">
                    <p className="truncate font-medium">{h.name}</p>
                    <p className="text-xs text-muted-foreground">{Math.round(habitConsistency(h, data) * 100)}% over the last 30 days</p>
                  </Link>
                  {isDue ? (
                    <Button onClick={() => checkIn(h.id)} variant="outline" className="h-12 px-4">
                      <Check className="h-4 w-4" /> Check in
                    </Button>
                  ) : (
                    <span className="flex h-12 items-center gap-1 px-3 text-sm text-primary"><Check className="h-4 w-4" /> Done</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle action={<Link to="/routes" className="text-sm text-primary">All routes</Link>}>Active routes</SectionTitle>
        {active.length === 0 ? (
          <Empty>
            No active routes. <Link to="/routes" className="text-primary underline">Start your first climb</Link>.
          </Empty>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {active.map((r) => {
              const s = routeStats(r, data);
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
