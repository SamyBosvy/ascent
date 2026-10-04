import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchPaged, localDate, useNewPerDay, useNewReviewedToday, useRefresh, useRouteStats, useRoutes, isLive, type Card } from "@/lib/data";
import { setCardsState } from "@/lib/cardActions";
import { MoreHorizontal, Moon, PauseCircle, Pencil, Undo2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { saveReview, undoReview, type PendingReview } from "@/lib/reviewQueue";
import { schedule, type Rating } from "@/lib/srs";
import { Empty, NativeSelect } from "@/components/app/fields";
import { CardDialog } from "@/components/app/CardDialog";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/review")({
  validateSearch: z.object({ route: z.string().optional() }),
  head: () => ({ meta: [{ title: "Review — Ascent" }, { name: "description", content: "Spaced-repetition review of your due cards." }] }),
  component: Review,
});

const RATINGS: { r: Rating; label: string }[] = [
  { r: 0, label: "Again" },
  { r: 1, label: "Hard" },
  { r: 2, label: "Good" },
  { r: 3, label: "Easy" },
];

/** Most overdue first; cards due on the same local day are Fisher-Yates shuffled. */
function orderQueue(cards: Card[]) {
  const sorted = [...cards].sort((a, b) => a.due_at.localeCompare(b.due_at));
  const out: Card[] = [];
  let i = 0;
  while (i < sorted.length) {
    const day = localDate(new Date(sorted[i]!.due_at));
    let j = i;
    while (j < sorted.length && localDate(new Date(sorted[j]!.due_at)) === day) j++;
    const group = sorted.slice(i, j);
    for (let k = group.length - 1; k > 0; k--) {
      const x = Math.floor(Math.random() * (k + 1));
      [group[k], group[x]] = [group[x]!, group[k]!];
    }
    out.push(...group);
    i = j;
  }
  return out;
}

type UndoEntry = {
  pending: PendingReview;
  prev: Card;
  counted: boolean;
  inflight: { signal: { cancelled: boolean }; promise: Promise<boolean> };
};

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  if (t?.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='alertdialog'], [role='menu']")) return true;
  return !!document.querySelector("[role='dialog'], [role='alertdialog'], [role='menu']");
}

function Review() {
  const { route } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: allRoutes } = useRoutes();
  const routes = allRoutes?.filter(isLive);
  const { data: stats } = useRouteStats();
  const { data: newPerDay } = useNewPerDay();
  const { data: newToday } = useNewReviewedToday();
  const { data: dueCards } = useQuery({
    queryKey: ["cards", "due", route ?? "all"],
    queryFn: () =>
      fetchPaged<Card>((a, b) => {
        let q = supabase
          .from("cards")
          .select("*, routes!inner(id)")
          .is("routes.archived_at", null)
          .is("routes.deleted_at", null)
          .is("suspended_at", null)
          .or(`buried_until.is.null,buried_until.lte.${localDate()}`)
          .lte("due_at", new Date().toISOString());
        if (route) q = q.eq("route_id", route);
        return q.order("due_at").order("id").range(a, b);
      }),
  });
  const refresh = useRefresh();
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState<Card | null>(null);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const card = queue?.[0];

  function rate(c: Card, r: Rating) {
    if (busy) return;
    const next = schedule(c, r);
    const reviewedAt = new Date().toISOString();
    const updated = { ...c, ...next, last_reviewed_at: reviewedAt };
    // Optimistic: move on immediately with the new schedule applied locally.
    setQueue((q) => {
      const rest = (q ?? []).slice(1);
      return r === 0 ? [...rest, updated] : rest;
    });
    setFlipped(false);
    if (r !== 0) setDone((d) => d + 1);
    // Durable: queued in localStorage first, retried, and re-sent on next load / when back online.
    const pending: PendingReview = { id: crypto.randomUUID(), card_id: c.id, rating: r, ...next, reviewed_at: reviewedAt };
    const signal = { cancelled: false };
    const promise = saveReview(pending, signal).then((ok) => {
      if (!ok && !signal.cancelled) toast("Offline for now. Your rating is saved on this device and will sync automatically.", { id: "review-pending" });
      return ok;
    });
    setUndoStack((s) => [...s, { pending, prev: c, counted: r !== 0, inflight: { signal, promise } }]);
  }

  async function undo() {
    const entry = undoStack.at(-1);
    if (!entry || busy) return;
    setBusy(true);
    try {
      await undoReview(entry.pending, entry.prev, entry.inflight);
    } catch (e) {
      toast.error(`Couldn't undo: ${(e as Error).message}`);
      setBusy(false);
      return;
    }
    setUndoStack((s) => s.slice(0, -1));
    setQueue((q) => [entry.prev, ...(q ?? []).filter((x) => x.id !== entry.prev.id)]);
    setFlipped(false);
    if (entry.counted) setDone((d) => d - 1);
    setBusy(false);
  }

  async function hide(c: Card, action: "suspend" | "bury") {
    const ok = await setCardsState([c.id], action, refresh, () => {
      setQueue((q) => (q ? [c, ...q.filter((x) => x.id !== c.id)] : q));
      setFlipped(false);
    });
    if (ok) {
      setQueue((q) => (q ?? []).filter((x) => x.id !== c.id));
      setFlipped(false);
    }
  }

  // Keyboard shortcuts — ignored while typing or when a dialog/menu is open.
  useEffect(() => {
    if (!queue) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); void undo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey || !card) return;
      const k = e.key.toLowerCase();
      if (!flipped && (e.key === " " || e.key === "Enter")) { e.preventDefault(); setFlipped(true); return; }
      if (flipped && ["1", "2", "3", "4"].includes(e.key)) { e.preventDefault(); rate(card, (Number(e.key) - 1) as Rating); return; }
      if (k === "e") { e.preventDefault(); setEditing(card); return; }
      if (k === "s") { e.preventDefault(); void hide(card, "suspend"); return; }
      if (k === "b") { e.preventDefault(); void hide(card, "bury"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!routes || !stats || !dueCards || newPerDay == null || newToday == null) return <p className="text-muted-foreground">Loading…</p>;
  const dueNow = dueCards.filter((c) => new Date(c.due_at).getTime() <= Date.now());
  const dueReviews = dueNow.filter((c) => c.last_reviewed_at);
  const newLeft = Math.max(0, newPerDay - newToday);
  const newCards = dueNow.filter((c) => !c.last_reviewed_at).sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, newLeft);
  const startCount = dueReviews.length + newCards.length;
  const totalCards = routes.reduce((a, r) => a + (stats.get(r.id)?.cards_total ?? 0), 0);
  const routeName = (rid: string) => routes.find((r) => r.id === rid)?.name ?? "";
  const editDialog = (
    <CardDialog
      open={!!editing}
      onOpenChange={(o) => !o && setEditing(null)}
      card={editing}
      onSaved={(c) => setQueue((q) => (q ? q.map((x) => (x.id === c.id ? { ...x, ...c } : x)) : q))}
    />
  );
  const undoButton = (
    <Button variant="outline" className="h-12" disabled={!undoStack.length || busy} onClick={() => void undo()}>
      <Undo2 className="h-4 w-4" /> Undo <kbd className="kbd-hint">Ctrl Z</kbd>
    </Button>
  );

  if (queue) {
    if (!card) {
      return (
        <div className="mx-auto max-w-md space-y-4 pt-10 text-center">
          <h1 className="text-3xl font-semibold">Review complete.</h1>
          <p className="text-muted-foreground">{done} card{done === 1 ? "" : "s"} reviewed. Steady progress.</p>
          <div className="flex justify-center gap-2">
            {undoButton}
            <Button className="h-12" onClick={() => { setQueue(null); setDone(0); setUndoStack([]); refresh(); }}>Done</Button>
          </div>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-xl space-y-5">
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span className="truncate">{routeName(card.route_id)}</span>
          <div className="flex items-center gap-1">
            <span className="mr-2">{queue.length} left</span>
            <Button variant="ghost" className="h-12" onClick={() => setEditing(card)}>
              <Pencil className="h-4 w-4" /> Edit <kbd className="kbd-hint">E</kbd>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-12 w-12" aria-label="More actions"><MoreHorizontal className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="min-h-12" onSelect={() => void hide(card, "suspend")}>
                  <PauseCircle className="h-4 w-4" /> Suspend <kbd className="kbd-hint ml-auto">S</kbd>
                </DropdownMenuItem>
                <DropdownMenuItem className="min-h-12" onSelect={() => void hide(card, "bury")}>
                  <Moon className="h-4 w-4" /> Bury until tomorrow <kbd className="kbd-hint ml-auto">B</kbd>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <button onClick={() => setFlipped(true)} className="surface flex min-h-72 w-full flex-col items-center justify-center gap-4 p-8 text-center shadow-sm">
          <p className="whitespace-pre-wrap font-display text-2xl font-semibold">{card.front}</p>
          {card.pronunciation && <p className="text-sm text-muted-foreground">/{card.pronunciation}/</p>}
          {flipped ? (
            <div className="w-full space-y-3 border-t pt-4">
              <p className="whitespace-pre-wrap text-lg">{card.back}</p>
              {card.example && <p className="text-sm italic text-muted-foreground">{card.example}</p>}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">Tap to reveal</span>
          )}
        </button>
        {flipped ? (
          <div className="grid grid-cols-4 gap-2">
            {RATINGS.map(({ r, label }) => (
              <Button key={r} variant={r === 2 ? "default" : "outline"} className="h-14" disabled={busy} onClick={() => rate(card, r)}>
                {label} <kbd className="kbd-hint">{r + 1}</kbd>
              </Button>
            ))}
          </div>
        ) : (
          <Button className="h-14 w-full" onClick={() => setFlipped(true)}>Show answer <kbd className="kbd-hint">Space</kbd></Button>
        )}
        <div className="flex items-center justify-between gap-2">
          {undoButton}
          <button className="tap px-3 text-sm text-muted-foreground" onClick={() => { setQueue(null); setUndoStack([]); refresh(); }}>End session</button>
        </div>
        {editDialog}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Review</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="h-12">
            <Link to="/cards" search={route ? { route } : {}}>Cards</Link>
          </Button>
          <Button variant="outline" className="h-12" onClick={() => setNewOpen(true)} disabled={!routes.length}>New card</Button>
        </div>
      </div>
      <NativeSelect value={route ?? ""} onChange={(e) => navigate({ search: { route: e.target.value || undefined } })}>
        <option value="">All routes</option>
        {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </NativeSelect>
      <div className="surface space-y-4 p-6 text-center">
        <p className="font-display text-5xl font-semibold">{startCount}</p>
        <p className="text-muted-foreground">{startCount ? `${startCount} card${startCount > 1 ? "s" : ""} due. Keep climbing.` : "Nothing due right now."}</p>
        <p className="text-sm text-muted-foreground">{newLeft} new card{newLeft === 1 ? "" : "s"} left today</p>
        {startCount ? (
          <Button className="h-12 w-full sm:w-auto sm:px-10" onClick={() => { setUndoStack([]); setDone(0); setQueue([...orderQueue(dueReviews), ...newCards]); }}>Start review</Button>
        ) : (
          <Button className="h-12 w-full sm:w-auto sm:px-10" disabled>Start review</Button>
        )}
      </div>
      {!totalCards && (
        <Empty>
          No cards yet. Add them from a <Link to="/routes" className="text-primary underline">route</Link>, a note, or a CSV import.
        </Empty>
      )}
      <CardDialog open={newOpen} onOpenChange={setNewOpen} {...(route ? { routeId: route } : {})} />
    </div>
  );
}
