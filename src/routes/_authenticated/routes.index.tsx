import { blockingError } from "@/lib/queryState";
import { RouteDot } from "@/components/app/RouteDot";
import { LearningRouteCard } from '@/components/app/LearningRouteCard';
import { ScreenSkeleton } from "@/components/app/ScreenSkeleton";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArchiveRestore, Plus, Trophy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isLive, STATUS_LABEL, TYPE_LABEL, useRefresh, useRouteStats, useRoutes, type RouteStatus } from "@/lib/data";
import { RouteDialog } from "@/components/app/RouteDialog";
import { Empty } from "@/components/app/fields";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/routes/")({
  head: () => ({ meta: [{ property: "og:title", content: "Routes — Ascent" }, { property: "og:description", content: "Everything you're mastering." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { title: "Routes — Ascent" }, { name: "description", content: "Everything you're mastering." }] }),
  component: RoutesPage,
});

const ORDER: RouteStatus[] = ["active", "paused", "summited", "abandoned"];

function RoutesPage() {
  const { data: routes, error: routesError } = useRoutes();
  const { data: stats, error: statsError } = useRouteStats();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [showArchived, setShowArchived] = useState(false);
  { const e = blockingError([routesError, routes], [statsError, stats]); if (e) throw e; }
  if (!routes || !stats) return <ScreenSkeleton screen="routes" />;
  const live = routes.filter(isLive);
  const archived = routes.filter((r) => !isLive(r));

  async function restore(id: string) {
    const { error } = await supabase.from("routes").update({ archived_at: null }).eq("id", id);
    if (error) { toast.error(`Couldn't restore: ${error.message}`); return; }
    toast.success("Route restored.");
    refresh();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="page-title">Routes</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="h-12">
            <Link to="/summits"><Trophy className="h-4 w-4 text-gold-text" /> Summits</Link>
          </Button>
          <Button className="h-12" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New route</Button>
        </div>
      </div>
      {live.length === 0 && <Empty headingLevel={2} illustration="tent" title="No routes yet" description="Keep what you’re learning together in a route." primaryAction={<Button onClick={() => setOpen(true)}>Create route</Button>} />}
      {ORDER.map((status) => {
        const list = live.filter((r) => r.status === status);
        if (!list.length) return null;
        return (
          <section key={status}>
            <h2 className="mb-3 section-title text-muted-foreground">{STATUS_LABEL[status]}</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {list.map((r) => {
                return (
                  <li key={r.id}>
                    <LearningRouteCard route={r} agg={stats.get(r.id)} />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {routes.length > 0 && (
        <section>
          <Button variant="ghost" className="h-12 px-2 section-title text-muted-foreground" onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived}>
            Archived ({archived.length}) {showArchived ? "▴" : "▾"}
          </Button>
          {showArchived && (
            <><ul className="mt-2 space-y-2">
              {archived.map((r) => (
                <li key={r.id} className="surface flex items-center gap-3 p-3 pl-4">
                  <Link to="/routes/$id" params={{ id: r.id }} className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 card-title"><RouteDot route={r} /><span className="truncate">{r.name}</span></p>
                    <p className="meta-text text-muted-foreground">{TYPE_LABEL[r.type]}</p>
                  </Link>
                  <Button variant="outline" className="h-12" onClick={() => restore(r.id)}><ArchiveRestore className="h-4 w-4" /> Restore</Button>
                </li>
              ))}
            </ul>{archived.length === 0 && <Empty illustration="ridge" title="No archived routes" description="Routes you archive will stay here with their progress." primaryAction={<Button variant="default" onClick={() => setShowArchived(false)}>Back to routes</Button>} />}</>
          )}
        </section>
      )}
      <RouteDialog
        key={formKey}
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setTimeout(() => setFormKey((k) => k + 1), 200); // fresh form after the close animation
        }}
      />
    </div>
  );
}
