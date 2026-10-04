import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { format } from "date-fns";
import { MoreHorizontal, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cardState, fetchPaged, isLive, localDate, useRefresh, useRoutes, type Card, type CardState } from "@/lib/data";
import { deleteCardWithUndo, setCardsState } from "@/lib/cardActions";
import { CardDialog } from "@/components/app/CardDialog";
import { CardText } from "@/components/app/CardText";
import { Empty, NativeSelect } from "@/components/app/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STATES = ["all", "due", "new", "suspended", "buried"] as const;
const SORTS = ["newest", "due", "alpha"] as const;

export const Route = createFileRoute("/_authenticated/cards")({
  validateSearch: z.object({
    route: z.string().optional(),
    state: z.enum(STATES).optional(),
    sort: z.enum(SORTS).optional(),
    q: z.string().optional(),
  }),
  head: () => ({ meta: [{ title: "Cards — Ascent" }, { name: "description", content: "Browse, edit and organise your flashcards." }] }),
  component: CardsPage,
});

const BADGE: Record<CardState, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  new: { label: "New", variant: "secondary" },
  due: { label: "Due", variant: "default" },
  suspended: { label: "Suspended", variant: "outline" },
  buried: { label: "Buried", variant: "outline" },
  scheduled: { label: "Scheduled", variant: "outline" },
};

/** Strip characters that have meaning in PostgREST filter syntax / ilike patterns. */
const safeTerm = (s: string) => s.replace(/[,()%*\\:"']/g, " ").trim();

function CardsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: routes } = useRoutes();
  const refresh = useRefresh();
  const state = search.state ?? "all";
  const sort = search.sort ?? "newest";
  const [q, setQ] = useState(search.q ?? "");
  useEffect(() => {
    const t = setTimeout(() => {
      if ((search.q ?? "") !== q) navigate({ search: (s) => ({ ...s, q: q || undefined }), replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [q, search.q, navigate]);

  const term = safeTerm(search.q ?? "");
  const { data: cards } = useQuery({
    queryKey: ["cards", "browse", search.route ?? "all", state, sort, term],
    queryFn: () =>
      fetchPaged<Card>((a, b) => {
        let x = supabase.from("cards").select("*, routes!inner(id)").is("routes.deleted_at", null);
        if (search.route) x = x.eq("route_id", search.route);
        if (term) x = x.or(`front.ilike.*${term}*,back.ilike.*${term}*,example.ilike.*${term}*`);
        const today = localDate();
        if (state === "suspended") x = x.not("suspended_at", "is", null);
        else if (state === "buried") x = x.is("suspended_at", null).gt("buried_until", today);
        else if (state === "new") x = x.is("last_reviewed_at", null).is("suspended_at", null);
        else if (state === "due")
          x = x.is("suspended_at", null).or(`buried_until.is.null,buried_until.lte.${today}`).not("last_reviewed_at", "is", null).lte("due_at", new Date().toISOString());
        if (sort === "due") x = x.order("due_at");
        else if (sort === "alpha") x = x.order("front");
        else x = x.order("created_at", { ascending: false });
        return x.order("id").range(a, b);
      }),
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Card | null>(null);
  const [moving, setMoving] = useState<string[] | null>(null);
  const [bulkDelete, setBulkDelete] = useState(false);
  useEffect(() => setSelected(new Set()), [search.route, state, sort, term]);

  if (!routes || !cards) return <p className="text-muted-foreground">Loading…</p>;
  const live = routes.filter(isLive);
  const archived = routes.filter((r) => !isLive(r));
  const routeName = (id: string) => routes.find((r) => r.id === id)?.name ?? "";
  const ids = [...selected];
  const allSelected = cards.length > 0 && cards.every((c) => selected.has(c.id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const set = (patch: Partial<typeof search>) => navigate({ search: (s) => ({ ...s, ...patch }) });

  async function bulk(action: "suspend" | "unsuspend") {
    if (await setCardsState(ids, action, refresh)) setSelected(new Set());
  }
  async function doBulkDelete() {
    const { error } = await supabase.from("cards").delete().in("id", ids);
    if (error) { toast.error(`Couldn't delete: ${error.message}`); return; }
    toast.success(`${ids.length} card${ids.length === 1 ? "" : "s"} deleted.`);
    setSelected(new Set());
    refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Cards</h1>
        <Button asChild variant="outline" className="h-12"><Link to="/review" search={search.route ? { route: search.route } : {}}>Review</Link></Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-12 pl-9" placeholder="Search front, back or example" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <NativeSelect value={search.route ?? ""} onChange={(e) => set({ route: e.target.value || undefined })} aria-label="Route">
          <option value="">All routes</option>
          {live.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          {archived.length > 0 && (
            <optgroup label="Archived">
              {archived.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </optgroup>
          )}
        </NativeSelect>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NativeSelect value={state} onChange={(e) => set({ state: e.target.value === "all" ? undefined : (e.target.value as (typeof STATES)[number]) })} aria-label="State">
          <option value="all">All cards</option>
          <option value="due">Due</option>
          <option value="new">New</option>
          <option value="suspended">Suspended</option>
          <option value="buried">Buried</option>
        </NativeSelect>
        <NativeSelect value={sort} onChange={(e) => set({ sort: e.target.value === "newest" ? undefined : (e.target.value as (typeof SORTS)[number]) })} aria-label="Sort">
          <option value="newest">Newest first</option>
          <option value="due">Due soonest</option>
          <option value="alpha">Alphabetical</option>
        </NativeSelect>
      </div>

      {cards.length > 0 && (
        <div className="surface flex flex-wrap items-center gap-2 p-2 pl-4">
          <label className="mr-auto flex min-h-12 items-center gap-3 text-sm">
            <Checkbox checked={allSelected} onCheckedChange={(v) => setSelected(v ? new Set(cards.map((c) => c.id)) : new Set())} aria-label="Select all" />
            {selected.size ? `${selected.size} selected` : `${cards.length} card${cards.length === 1 ? "" : "s"}`}
          </label>
          {selected.size > 0 && (
            <>
              <Button variant="outline" className="h-12" onClick={() => setMoving(ids)}>Move</Button>
              <Button variant="outline" className="h-12" onClick={() => bulk("suspend")}>Suspend</Button>
              <Button variant="outline" className="h-12" onClick={() => bulk("unsuspend")}>Unsuspend</Button>
              <Button variant="outline" className="h-12 text-destructive" onClick={() => setBulkDelete(true)}>Delete</Button>
            </>
          )}
        </div>
      )}

      {cards.length === 0 ? (
        <Empty>{term ? "No cards match that search." : "No cards here yet."}</Empty>
      ) : (
        <ul className="space-y-2">
          {cards.map((c) => {
            const st = cardState(c);
            return (
              <li key={c.id} className="surface flex items-start gap-3 p-2 pl-4">
                <div className="flex min-h-12 items-center">
                  <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} aria-label={`Select ${c.front}`} />
                </div>
                <button className="min-w-0 flex-1 py-2 text-left" onClick={() => setEditing(c)}>
                  <CardText text={c.front} className="card-clamp font-medium" />
                  <CardText text={c.back} className="card-clamp text-sm text-muted-foreground" />
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant={BADGE[st].variant}>{BADGE[st].label}</Badge>
                    <span>{routeName(c.route_id)}</span>
                    <span>· due {format(new Date(c.due_at), "MMM d")}</span>
                    <span>· {c.interval_days}d interval</span>
                  </p>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-12 w-12" aria-label="Card actions"><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem className="min-h-12" onSelect={() => setEditing(c)}>Edit</DropdownMenuItem>
                    <DropdownMenuItem className="min-h-12" onSelect={() => setMoving([c.id])}>Move to route…</DropdownMenuItem>
                    {c.suspended_at ? (
                      <DropdownMenuItem className="min-h-12" onSelect={() => void setCardsState([c.id], "unsuspend", refresh)}>Unsuspend</DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem className="min-h-12" onSelect={() => void setCardsState([c.id], "suspend", refresh)}>Suspend</DropdownMenuItem>
                    )}
                    <DropdownMenuItem className="min-h-12 text-destructive" onSelect={() => void deleteCardWithUndo(c, refresh)}>Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}

      <CardDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} card={editing} />
      <MoveDialog ids={moving} onClose={() => setMoving(null)} onDone={() => { setSelected(new Set()); refresh(); }} />
      <AlertDialog open={bulkDelete} onOpenChange={setBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {ids.length} card{ids.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>Their review history is deleted too. This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void doBulkDelete()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MoveDialog({ ids, onClose, onDone }: { ids: string[] | null; onClose: () => void; onDone: () => void }) {
  const { data: routes } = useRoutes();
  const live = (routes ?? []).filter(isLive);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (ids) setTarget(live[0]?.id ?? ""); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ids]);
  async function move() {
    if (!ids || !target) return;
    setBusy(true);
    const { error } = await supabase.rpc("move_cards", { _ids: ids, _route: target });
    setBusy(false);
    if (error) { toast.error(`Couldn't move: ${error.message}`); return; }
    toast.success(`Moved ${ids.length} card${ids.length === 1 ? "" : "s"}.`);
    onDone();
    onClose();
  }
  return (
    <Dialog open={!!ids} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Move {ids?.length ?? 0} card{ids?.length === 1 ? "" : "s"}</DialogTitle></DialogHeader>
        <NativeSelect value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Move to route">
          {live.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </NativeSelect>
        <Button className="h-12 w-full" disabled={!target || busy} onClick={() => void move()}>Move</Button>
      </DialogContent>
    </Dialog>
  );
}
