import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import {
  BarChart3, BookOpen, FileText, Layers, Library, Mountain, Pause, Play, Plus, Search, Settings, Sun, Trophy, Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { must, useRoutes } from "@/lib/data";
import { timer, useTimer } from "@/lib/timer";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { RouteDialog } from "./RouteDialog";
import { CardDialog } from "./CardDialog";

/** Words safe for a prefix tsquery ('simple' config): letters/digits only, each matched as a prefix. */
export function prefixTsQuery(q: string) {
  return q.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}_]/gu, "")).filter(Boolean).map((w) => `${w}:*`).join(" & ");
}
/** Strip characters with meaning in PostgREST filters / ilike patterns. */
export const safeTerm = (s: string) => s.replace(/[,()%*\\:"'.]/g, " ").replace(/\s+/g, " ").trim();

type Hit = { id: string; label: string; sub?: string; routeId?: string };

function useSearch(q: string, archived: boolean) {
  return useQuery({
    queryKey: ["palette-search", q, archived],
    enabled: q.length >= 2,
    staleTime: 10_000,
    queryFn: async () => {
      const term = safeTerm(q);
      const tsq = prefixTsQuery(q);
      let r = supabase.from("routes").select("id, name, archived_at").is("deleted_at", null).ilike("name", `%${term}%`);
      if (!archived) r = r.is("archived_at", null);
      let n = supabase.from("notes").select("id, title, body, routes!inner(id, name)").is("routes.deleted_at", null);
      if (!archived) n = n.is("routes.archived_at", null);
      let c = supabase.from("cards").select("id, front, back, route_id, routes!inner(id, name)").is("routes.deleted_at", null);
      if (!archived) c = c.is("routes.archived_at", null);
      const [routes, notes, cards] = await Promise.all([
        term ? must(r.order("name").limit(5)) : [],
        tsq ? must(n.textSearch("search", tsq, { config: "simple" }).order("updated_at", { ascending: false }).limit(5)) : [],
        term ? must(c.or(`front.ilike.*${term}*,back.ilike.*${term}*`).order("created_at", { ascending: false }).limit(5)) : [],
      ]);
      const name = (x: unknown) => (x as { name?: string } | null)?.name ?? "";
      return {
        routes: (routes as { id: string; name: string; archived_at: string | null }[]).map((x): Hit => ({ id: x.id, label: x.name, ...(x.archived_at ? { sub: "Archived" } : {}) })),
        notes: (notes as { id: string; title: string; body: string; routes: unknown }[]).map((x): Hit => ({ id: x.id, label: x.title || x.body.split("\n")[0] || "Untitled", sub: name(x.routes) })),
        cards: (cards as { id: string; front: string; route_id: string; routes: unknown }[]).map((x): Hit => ({ id: x.id, label: x.front, sub: name(x.routes), routeId: x.route_id })),
      };
    },
  });
}

export function CommandPalette({ open, onOpenChange, onQuickCapture }: { open: boolean; onOpenChange: (o: boolean) => void; onQuickCapture: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [archived, setArchived] = useState(false);
  const [newRoute, setNewRoute] = useState(false);
  const [newCard, setNewCard] = useState(false);
  const { data: routes } = useRoutes();
  const { state: t } = useTimer();
  const currentRouteId = useRouterState({
    select: (s) => (s.matches.find((m) => m.routeId === "/_authenticated/routes/$id")?.params as { id?: string } | undefined)?.id,
  });
  const current = routes?.find((r) => r.id === currentRouteId && !r.deleted_at);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(id);
  }, [q]);
  useEffect(() => { if (!open) { setQ(""); setDebounced(""); } }, [open]);

  const { data: hits, isFetching } = useSearch(debounced, archived);

  const run = (fn: () => void) => { onOpenChange(false); fn(); };
  const go = (to: "/today" | "/routes" | "/review" | "/cards" | "/notes" | "/insights" | "/summits" | "/settings") => run(() => navigate({ to }));

  const pages = [
    { to: "/today", label: "Today", icon: Sun },
    { to: "/routes", label: "Routes", icon: Mountain },
    { to: "/review", label: "Review", icon: Layers },
    { to: "/cards", label: "Cards", icon: Library },
    { to: "/notes", label: "Notes", icon: BookOpen },
    { to: "/insights", label: "Insights", icon: BarChart3 },
    { to: "/summits", label: "Summits", icon: Trophy },
    { to: "/settings", label: "Settings", icon: Settings },
  ] as const;
  const match = (s: string) => !q.trim() || s.toLowerCase().includes(q.trim().toLowerCase());
  const item = "flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground";
  const mine = t && current && t.routeId === current.id;

  const actions: { key: string; label: string; icon: typeof Plus; onSelect: () => void }[] = [
    { key: "new-route", label: "New route", icon: Plus, onSelect: () => run(() => setNewRoute(true)) },
    { key: "new-card", label: current ? `New card in ${current.name}` : "New card", icon: Plus, onSelect: () => run(() => setNewCard(true)) },
    { key: "capture", label: "Quick capture", icon: Zap, onSelect: () => run(onQuickCapture) },
    { key: "review", label: current ? `Start review: ${current.name}` : "Start review", icon: Layers, onSelect: () => run(() => navigate({ to: "/review", search: current ? { route: current.id } : {} })) },
  ];
  if (current && !current.archived_at) {
    if (mine && !t!.paused) actions.push({ key: "pause", label: `Pause session timer (${current.name})`, icon: Pause, onSelect: () => run(() => timer.pause()) });
    else if (mine) actions.push({ key: "resume", label: `Resume session timer (${current.name})`, icon: Play, onSelect: () => run(() => timer.resume()) });
    else if (!t) actions.push({ key: "start", label: `Start session timer (${current.name})`, icon: Play, onSelect: () => run(() => timer.start(current.id, current.name)) });
  }
  if (t && !mine) actions.push({ key: "running", label: `Go to running session (${t.routeName})`, icon: Play, onSelect: () => run(() => navigate({ to: "/routes/$id", params: { id: t.routeId } })) });

  const shownActions = actions.filter((a) => match(a.label));
  const shownPages = pages.filter((p) => match(`Go to ${p.label}`));
  const searching = debounced.length >= 2;
  const nothing = !shownActions.length && !shownPages.length && (!searching || (hits && !hits.routes.length && !hits.notes.length && !hits.cards.length));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-xl">
          <DialogTitle className="sr-only">Search and commands</DialogTitle>
          <DialogDescription className="sr-only">Type to search routes, notes and cards, or pick an action.</DialogDescription>
          <Command shouldFilter={false} label="Search and commands" className="flex flex-col">
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <Command.Input value={q} onValueChange={setQ} placeholder="Search or type a command…" className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground" />
            </div>
            <label className="flex items-center justify-end gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
              <Switch checked={archived} onCheckedChange={setArchived} aria-label="Show archived" />
              Show archived
            </label>
            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              {nothing && <Command.Empty className="p-4 text-center text-sm text-muted-foreground">{isFetching ? "Searching…" : "Nothing found."}</Command.Empty>}
              {searching && hits && hits.routes.length > 0 && (
                <Command.Group heading="Routes" className="mb-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground">
                  {hits.routes.map((h) => (
                    <Command.Item key={h.id} value={`route-${h.id}`} className={item} onSelect={() => run(() => navigate({ to: "/routes/$id", params: { id: h.id } }))}>
                      <Mountain className="h-4 w-4 shrink-0" aria-hidden /><span className="truncate">{h.label}</span>{h.sub && <span className="ml-auto text-xs text-muted-foreground">{h.sub}</span>}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {searching && hits && hits.notes.length > 0 && (
                <Command.Group heading="Notes" className="mb-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground">
                  {hits.notes.map((h) => (
                    <Command.Item key={h.id} value={`note-${h.id}`} className={item} onSelect={() => run(() => navigate({ to: "/notes/$id", params: { id: h.id } }))}>
                      <FileText className="h-4 w-4 shrink-0" aria-hidden /><span className="truncate">{h.label}</span><span className="ml-auto shrink-0 text-xs text-muted-foreground">{h.sub}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {searching && hits && hits.cards.length > 0 && (
                <Command.Group heading="Cards" className="mb-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground">
                  {hits.cards.map((h) => (
                    <Command.Item key={h.id} value={`card-${h.id}`} className={item} onSelect={() => run(() => navigate({ to: "/cards", search: { route: h.routeId, q: safeTerm(h.label).slice(0, 80) } }))}>
                      <Library className="h-4 w-4 shrink-0" aria-hidden /><span className="truncate">{h.label}</span><span className="ml-auto shrink-0 text-xs text-muted-foreground">{h.sub}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {shownActions.length > 0 && (
                <Command.Group heading="Actions" className="mb-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground">
                  {shownActions.map((a) => (
                    <Command.Item key={a.key} value={a.key} className={item} onSelect={a.onSelect}>
                      <a.icon className="h-4 w-4 shrink-0" aria-hidden />{a.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {shownPages.length > 0 && (
                <Command.Group heading="Go to" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground">
                  {shownPages.map((p) => (
                    <Command.Item key={p.to} value={`go-${p.to}`} className={item} onSelect={() => go(p.to)}>
                      <p.icon className="h-4 w-4 shrink-0" aria-hidden />Go to {p.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </DialogContent>
      </Dialog>
      <RouteDialog open={newRoute} onOpenChange={setNewRoute} />
      {newCard && <CardDialog open={newCard} onOpenChange={setNewCard} {...(current && !current.archived_at ? { routeId: current.id } : {})} />}
    </>
  );
}
