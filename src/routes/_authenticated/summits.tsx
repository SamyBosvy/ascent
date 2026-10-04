import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { minutesLabel, TYPE_LABEL, useRouteStats, useRoutes } from "@/lib/data";
import { Empty } from "@/components/app/fields";

export const Route = createFileRoute("/_authenticated/summits")({
  head: () => ({ meta: [{ title: "Summits — Ascent" }, { name: "description", content: "Everything you've mastered." }, { property: "og:title", content: "Summits — Ascent" }, { property: "og:description", content: "Everything you've mastered." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Summits,
});

function Summits() {
  const { data: routes } = useRoutes();
  const { data: stats } = useRouteStats();
  if (!routes || !stats) return <p className="text-muted-foreground">Loading…</p>;
  const list = routes.filter((r) => r.summited_at).sort((a, b) => b.summited_at!.localeCompare(a.summited_at!));
  return (
    <div className="space-y-6">
      <Link to="/routes" className="text-sm text-muted-foreground">← Routes</Link>
      <h1 className="text-3xl font-semibold">Summits</h1>
      {list.length === 0 ? (
        <Empty>Your trophy shelf is waiting. Every summit you reach lands here.</Empty>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {list.map((r) => {
            const mins = Number(stats.get(r.id)?.minutes ?? 0);
            return (
              <li key={r.id}>
                <Link to="/routes/$id" params={{ id: r.id }} className="surface relative block overflow-hidden p-5">
                  <div className="absolute inset-x-0 top-0 h-1 bg-gold" />
                  <svg viewBox="0 0 40 30" className="mb-3 h-8 w-10" aria-hidden>
                    <path d="M2 28 L20 6 L38 28 Z" className="fill-ridge" />
                    <line x1="20" y1="6" x2="20" y2="-4" className="stroke-foreground" strokeWidth="1.5" />
                    <path d="M20 -4 L30 -1 L20 2 Z" className="fill-gold" />
                  </svg>
                  <p className="font-display text-lg font-semibold">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{TYPE_LABEL[r.type]}</p>
                  <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
                    <div><dt className="text-xs text-muted-foreground">Started</dt><dd>{format(new Date(r.created_at), "MMM d, yy")}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Summited</dt><dd>{format(new Date(r.summited_at!), "MMM d, yy")}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Hours</dt><dd>{minutesLabel(mins)}</dd></div>
                  </dl>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
