import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchPaged, startOfWeek, useRouteStats, useRoutes } from "@/lib/data";
import { habitConsistency } from "@/lib/camp";
import { Empty, SectionTitle } from "@/components/app/fields";

export const Route = createFileRoute("/_authenticated/insights")({
  head: () => ({ meta: [{ title: "Insights — Ascent" }, { name: "description", content: "Time, retention and consistency over time." }] }),
  component: Insights,
});

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function eightWeeks() {
  return Array.from({ length: 8 }, (_, i) => {
    const s = startOfWeek();
    s.setDate(s.getDate() - (7 - i) * 7);
    return s;
  });
}

// Only the window the charts show: sessions + reviews from the first charted week onward.
function useInsightRows() {
  return useQuery({
    queryKey: ["insights", "rows"],
    queryFn: async () => {
      const from = eightWeeks()[0]!.toISOString();
      const [sessions, reviews] = await Promise.all([
        fetchPaged<{ route_id: string; minutes: number; logged_at: string }>((a, b) =>
          supabase.from("sessions").select("route_id, minutes, logged_at").gte("logged_at", from).order("logged_at").order("id").range(a, b)),
        fetchPaged<{ rating: number; reviewed_at: string }>((a, b) =>
          supabase.from("reviews").select("rating, reviewed_at").gte("reviewed_at", from).order("reviewed_at").order("id").range(a, b)),
      ]);
      return { sessions, reviews };
    },
  });
}

function Insights() {
  const { data: routes } = useRoutes();
  const { data: stats } = useRouteStats();
  const { data: rows } = useInsightRows();
  const { user } = Route.useRouteContext();
  if (!routes || !stats || !rows) return <p className="text-muted-foreground">Loading…</p>;

  const ageDays = (Date.now() - new Date(user.created_at).getTime()) / 86400000;
  if (ageDays < 7) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-semibold">Insights</h1>
        <Empty>Insights unlock after your first week.</Empty>
      </div>
    );
  }

  // Weekly minutes per route, last 8 weeks
  const weeks = eightWeeks();
  // Every route with any session ever, most recently logged first (same order as before).
  const routeIds = [...stats.values()]
    .filter((a) => a.session_count > 0)
    .sort((a, b) => (b.last_session_at ?? "").localeCompare(a.last_session_at ?? ""))
    .map((a) => a.route_id);
  const name = (id: string) => routes.find((r) => r.id === id)?.name ?? "Route";
  const timeData = weeks.map((w) => {
    const end = w.getTime() + 7 * 86400000;
    const row: Record<string, string | number> = { week: format(w, "MMM d") };
    for (const rid of routeIds) {
      const m = rows.sessions.filter((s) => s.route_id === rid && new Date(s.logged_at).getTime() >= w.getTime() && new Date(s.logged_at).getTime() < end).reduce((a, s) => a + s.minutes, 0);
      row[name(rid)] = Math.round((m / 60) * 10) / 10;
    }
    return row;
  });

  const retention = weeks.map((w) => {
    const end = w.getTime() + 7 * 86400000;
    const rs = rows.reviews.filter((r) => new Date(r.reviewed_at).getTime() >= w.getTime() && new Date(r.reviewed_at).getTime() < end);
    return { week: format(w, "MMM d"), retention: rs.length ? Math.round((rs.filter((r) => r.rating >= 2).length / rs.length) * 100) : null };
  });

  const habits = routes.filter((r) => r.type === "habit");
  const summits = routes.filter((r) => r.summited_at).sort((a, b) => b.summited_at!.localeCompare(a.summited_at!));
  const axis = { stroke: "var(--muted-foreground)", fontSize: 12 };

  return (
    <div className="space-y-10">
      <h1 className="text-3xl font-semibold">Insights</h1>
      <section>
        <SectionTitle>Hours per route, by week</SectionTitle>
        <div className="surface h-72 p-3">
          {routeIds.length ? (
            <ResponsiveContainer>
              <BarChart data={timeData}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="week" {...axis} />
                <YAxis {...axis} width={30} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {routeIds.map((rid, i) => <Bar key={rid} dataKey={name(rid)} stackId="a" fill={COLORS[i % COLORS.length]} />)}
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty>No sessions logged yet.</Empty>}
        </div>
      </section>
      <section>
        <SectionTitle>Flashcard retention</SectionTitle>
        <div className="surface h-64 p-3">
          <ResponsiveContainer>
            <LineChart data={retention}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="week" {...axis} />
              <YAxis {...axis} width={36} domain={[0, 100]} unit="%" />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12 }} />
              <Line type="monotone" dataKey="retention" stroke="var(--chart-1)" strokeWidth={2.5} connectNulls dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section>
        <SectionTitle>Habit consistency (30 days)</SectionTitle>
        {habits.length ? (
          <ul className="space-y-3">
            {habits.map((h) => {
              const pct = Math.round(habitConsistency(h, stats.get(h.id)) * 100);
              return (
                <li key={h.id} className="surface p-4">
                  <div className="mb-2 flex justify-between text-sm"><span className="font-medium">{h.name}</span><span>{pct}%</span></div>
                  <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                </li>
              );
            })}
          </ul>
        ) : <Empty>No habits yet.</Empty>}
      </section>
      <section>
        <SectionTitle>Routes summited</SectionTitle>
        {summits.length ? (
          <ul className="surface divide-y">
            {summits.map((r) => (
              <li key={r.id} className="flex justify-between gap-3 p-4 text-sm">
                <span className="font-medium">{r.name}</span>
                <span className="text-muted-foreground">{format(new Date(r.summited_at!), "MMM d, yyyy")}</span>
              </li>
            ))}
          </ul>
        ) : <Empty>No summits yet. They'll be listed here.</Empty>}
      </section>
    </div>
  );
}
