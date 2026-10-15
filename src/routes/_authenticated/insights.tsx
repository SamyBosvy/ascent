import { blockingError } from "@/lib/queryState";
import { routeColourToken } from "@/lib/routeColours";
import { ScreenSkeleton } from "@/components/app/ScreenSkeleton";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { usePrefersReducedMotion } from "@/lib/motion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchPaged, isLive, useRouteStats, useRoutes, weekStartDate } from "@/lib/data";
import { getPrefs } from "@/lib/prefs";
import { addDays, shortDate, zonedMidnight } from "@/lib/time";
import { habitConsistency } from "@/lib/camp";
import { Button } from "@/components/ui/button";
import { SummitIcon } from "@/components/app/icons";
import { Empty, SectionTitle } from "@/components/app/fields";

export const Route = createFileRoute("/_authenticated/insights")({
  head: () => ({ meta: [{ property: "og:title", content: "Insights — Ascent" }, { property: "og:description", content: "Time, retention and consistency over time." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { title: "Insights — Ascent" }, { name: "description", content: "Time, retention and consistency over time." }] }),
  component: Insights,
});



/** Last eight weeks in the user's timezone and week start; each bucket is [start, end). */
function eightWeeks() {
  const tz = getPrefs().tz;
  const current = weekStartDate();
  return Array.from({ length: 8 }, (_, i) => {
    const day = addDays(current, -(7 - i) * 7);
    return { day, start: zonedMidnight(day, tz).getTime(), end: zonedMidnight(addDays(day, 7), tz).getTime() };
  });
}

// Only the window the charts show: sessions + reviews from the first charted week onward.
function useInsightRows() {
  return useQuery({
    queryKey: ["insights", "rows"],
    queryFn: async () => {
      const from = new Date((eightWeeks()[0]?.start ?? Date.now())).toISOString();
      const [sessions, reviews] = await Promise.all([
        fetchPaged<{ route_id: string; minutes: number; logged_at: string }>((a, b) =>
          supabase.from("sessions").select("route_id, minutes, logged_at, routes!inner(id)").is("routes.deleted_at", null).gte("logged_at", from).order("logged_at").order("id").range(a, b)),
        fetchPaged<{ rating: number; reviewed_at: string }>((a, b) =>
          supabase.from("reviews").select("rating, reviewed_at, routes!inner(id)").is("routes.deleted_at", null).gte("reviewed_at", from).order("reviewed_at").order("id").range(a, b)),
      ]);
      // Unlock counts (all time, not just the window).
      const { count: reviewCount, error } = await supabase.from("reviews").select("id, routes!inner(id)", { count: "exact", head: true }).is("routes.deleted_at", null);
      if (error) throw new Error(error.message);
      return { sessions, reviews, reviewCount: reviewCount ?? 0 };
    },
  });
}

function Insights() {
  const reduced = usePrefersReducedMotion();
  const { data: routes, error: routesError } = useRoutes();
  const { data: stats, error: statsError } = useRouteStats();
  const { data: rows, error: rowsError } = useInsightRows();
  { const e = blockingError([routesError, routes], [statsError, stats], [rowsError, rows]); if (e) throw e; }
  if (!routes || !stats || !rows) return <ScreenSkeleton screen="insights" />;

  const sessionCount = [...stats.values()].reduce((a, s) => a + s.session_count, 0);
  if (sessionCount < 3 && rows.reviewCount < 10) {
    return (
      <div className="space-y-6">
        <h1 className="page-title">Insights</h1>
        <Empty headingLevel={2} illustration="chart" title="Not enough activity yet" description="Log 3 sessions or do 10 reviews to see your progress." primaryAction={<Button asChild><Link to="/today">Back to Today</Link></Button>} />
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
    const row: Record<string, string | number> = { week: shortDate(w.day) };
    for (const rid of routeIds) {
      const m = rows.sessions.filter((s) => s.route_id === rid && new Date(s.logged_at).getTime() >= w.start && new Date(s.logged_at).getTime() < w.end).reduce((a, s) => a + s.minutes, 0);
      row[rid] = Math.round((m / 60) * 10) / 10;
    }
    return row;
  });

  const retention = weeks.map((w) => {
    const rs = rows.reviews.filter((r) => new Date(r.reviewed_at).getTime() >= w.start && new Date(r.reviewed_at).getTime() < w.end);
    return { week: shortDate(w.day), retention: rs.length ? Math.round((rs.filter((r) => r.rating >= 2).length / rs.length) * 100) : null };
  });

  const habits = routes.filter((r) => r.type === "habit" && isLive(r));
  const summits = routes.filter((r) => r.summited_at).sort((a, b) => b.summited_at!.localeCompare(a.summited_at!));
  const axis = { stroke: "var(--muted-foreground)", fontSize: 12 };

  return (
    <div className="space-y-10">
      <h1 className="page-title">Insights</h1>
      <section>
        <SectionTitle>Hours per route, by week</SectionTitle>
        <div role="group" aria-label="Hours spent per route each week, over the last eight weeks" className={routeIds.length ? "surface h-72 p-3" : ""}>
          <div className="sr-only"><table>
            <caption>Hours per route, by week</caption>
            <thead><tr><th scope="col">Week</th>{routeIds.map(rid => <th key={rid} scope="col">{name(rid)} (hours)</th>)}</tr></thead>
            <tbody>{timeData.map(row => <tr key={row["week"]}><th scope="row">{row["week"]}</th>{routeIds.map(rid => <td key={rid}>{row[rid]}</td>)}</tr>)}</tbody>
          </table></div>
          {routeIds.length ? (
            <div aria-hidden="true" className="h-full">
            <ResponsiveContainer>
              <BarChart data={timeData} accessibilityLayer={false}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="week" {...axis} />
                <YAxis {...axis} width={30} />
                <Tooltip isAnimationActive={!reduced} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {routeIds.map((rid) => <Bar isAnimationActive={!reduced} key={rid} dataKey={rid} name={name(rid)} stackId="a" fill={routeColourToken(routes.find((r) => r.id === rid) ?? { id: rid })} />)}
              </BarChart>
            </ResponsiveContainer>
            </div>
          ) : <Empty illustration="chart" title="No study time yet" description="Your logged time will appear here by week." primaryAction={<Button asChild><Link to="/today">Log time on Today</Link></Button>} />}
        </div>
      </section>
      <section>
        <SectionTitle>Flashcard retention</SectionTitle>
        <div role="group" aria-label="Weekly flashcard retention percentage over the last eight weeks" className={retention.every(r => r.retention == null) ? "" : "surface h-64 p-3"}>
          <div className="sr-only"><table>
            <caption>Flashcard retention</caption>
            <thead><tr><th scope="col">Week</th><th scope="col">Retention (%)</th></tr></thead>
            <tbody>{retention.map(row => <tr key={row.week}><th scope="row">{row.week}</th><td>{row.retention == null ? "No reviews" : `${row.retention}%`}</td></tr>)}</tbody>
          </table></div>
          {retention.every((r) => r.retention == null) ? (
            <Empty illustration="cards" title="No recent reviews" description="Your recall over the last eight weeks will appear here." primaryAction={<Button asChild><Link to="/review">Open review</Link></Button>} />
          ) : (
          <div aria-hidden="true" className="h-full">
          <ResponsiveContainer>
            <LineChart data={retention} accessibilityLayer={false}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="week" {...axis} />
              <YAxis {...axis} width={36} domain={[0, 100]} unit="%" />
              <Tooltip isAnimationActive={!reduced} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12 }} />
              <Line isAnimationActive={!reduced} type="monotone" dataKey="retention" stroke="var(--chart-1)" strokeWidth={2.5} connectNulls dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
          </div>
          )}
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
                  <div className="mb-2 flex justify-between body-text"><span className="font-medium">{h.name}</span><span>{pct}%</span></div>
                  <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                </li>
              );
            })}
          </ul>
        ) : <Empty illustration="calendar" title="No habits yet" description="Habit routes show your 30-day consistency here." primaryAction={<Button asChild><Link to="/routes">Open routes</Link></Button>} />}
      </section>
      <section>
        <SectionTitle>Routes summited</SectionTitle>
        {summits.length ? (
          <ul className="surface divide-y">
            {summits.map((r) => (
              <li key={r.id} className="flex justify-between gap-3 p-4 body-text">
                <span className="flex items-center gap-2 font-medium"><SummitIcon className="size-5 shrink-0 text-gold-text" />{r.name}</span>
                <span className="text-muted-foreground">{format(new Date(r.summited_at!), "MMM d, yyyy")}</span>
              </li>
            ))}
          </ul>
        ) : <Empty illustration="flag" title="No summits yet" description="Finished routes will appear here." primaryAction={<Button asChild><Link to="/routes">Open routes</Link></Button>} />}
      </section>
    </div>
  );
}
