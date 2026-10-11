import { blockingError } from "@/lib/queryState";
import { usePrefersReducedMotion } from "@/lib/motion";
import { RouteDot } from "@/components/app/RouteDot";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchPaged, localDate, useNewPerDay, useNewReviewedToday, useRefresh, useRouteStats, useRoutes, isLive, type Card } from "@/lib/data";
import { setCardsState } from "@/lib/cardActions";
import { MoreHorizontal, Moon, PauseCircle, Pencil, Undo2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { saveReview, undoReview, type PendingReview } from "@/lib/reviewQueue";
import { type Rating } from "@/lib/srs";
import { Empty, NativeSelect } from "@/components/app/fields";
import { CardText, SpeakButton } from "@/components/app/CardText";
import { speak, speakable, speechAvailable } from "@/lib/cardText";
import { CardDialog } from "@/components/app/CardDialog";
import { Button } from "@/components/ui/button";
import { previewSchedules, intervalLabel } from "@/lib/reviewPreview";
import { orderQueue, shuffle } from "@/lib/reviewOrdering";
import { getPrefs } from "@/lib/prefs";
import { useNextDue, nextDueLabel } from "@/lib/nextDue";
import { ScreenSkeleton } from "@/components/app/ScreenSkeleton";

export const Route = createFileRoute("/_authenticated/review")({
  validateSearch: z.object({ route: z.string().optional() }),
  head: () => ({ meta: [{ property: "og:title", content: "Review — Ascent" }, { property: "og:description", content: "Spaced-repetition review of your due cards." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { title: "Review — Ascent" }, { name: "description", content: "Spaced-repetition review of your due cards." }] }),
  component: Review,
});

const RATINGS: { r: Rating; label: string }[] = [
  { r: 0, label: "Again" },
  { r: 1, label: "Hard" },
  { r: 2, label: "Good" },
  { r: 3, label: "Easy" },
];

type UndoEntry = {
  prev: Card;
  counted: boolean;
  /** Absent for cram ratings, which are never saved. */
  saved?: { pending: PendingReview; inflight: { signal: { cancelled: boolean }; promise: Promise<boolean> } };
};
type Mode = "review" | "ahead" | "cram";

/** Cards of live routes matching the shared "reviewable" rules (not suspended, not buried). */
function liveCards() {
  return supabase
    .from("cards")
    .select("*, routes!inner(id)")
    .is("routes.archived_at", null)
    .is("routes.deleted_at", null)
    .is("suspended_at", null);
}

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  if (t?.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='alertdialog'], [role='menu']")) return true;
  return !!document.querySelector("[role='dialog'], [role='alertdialog'], [role='menu']");
}

function Review() {
  const { route } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: allRoutes, error: routesError } = useRoutes();
  const routes = allRoutes?.filter(isLive);
  const { data: stats, error: statsError } = useRouteStats();
  const { data: newPerDay, error: settingsError } = useNewPerDay();
  const { data: newToday, error: newError } = useNewReviewedToday();
  const { data: dueCards, error: dueError } = useQuery({
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
  const { data: nextDue } = useNextDue(route, dueCards?.length === 0);
  const refresh = useRefresh();
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState<Card | null>(null);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("review");
  const [aheadDays, setAheadDays] = useState("1");
  const [cramRoute, setCramRoute] = useState("");
  const [loadingExtra, setLoadingExtra] = useState(false);

  const card = queue?.[0];
  const showAnswerRef = useRef<HTMLButtonElement>(null);
  const ratingsRef = useRef<HTMLDivElement>(null);
  const focusReview = useRef(false);
  useEffect(() => {
    if (!focusReview.current || !card) return;
    if (flipped) ratingsRef.current?.focus();
    else showAnswerRef.current?.focus();
  }, [card, flipped]);
  function reveal() {
    focusReview.current = true;
    setFlipped(true);
  }
  // Each card appearance gets one shared fuzz sample per rating, reused verbatim by save.
  const previews = useMemo(() => card && mode !== "cram" ? previewSchedules(card) : null, [card, mode]);
  const touch = useRef<{ x: number; y: number; horizontal: boolean; vertical: boolean } | null>(null);
  const [drag, setDrag] = useState(0);
  const suppressClick = useRef(false);
  const reducedMotion = usePrefersReducedMotion();
  function touchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (!flipped || busy || (e.target as HTMLElement).closest('button,a')) return;
    const t = e.touches[0];
    if (t) touch.current = { x: t.clientX, y: t.clientY, horizontal: false, vertical: false };
  }
  function touchMove(e: React.TouchEvent<HTMLDivElement>) {
    const start = touch.current; const t = e.touches[0];
    if (!start || !t || start.vertical) return;
    const dx = t.clientX - start.x, dy = t.clientY - start.y;
    if (!start.horizontal && Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) { start.vertical = true; setDrag(0); return; }
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.3) start.horizontal = true;
    if (start.horizontal && !reducedMotion) setDrag(Math.max(-120, Math.min(120, dx)));
  }
  function touchEnd(e: React.TouchEvent<HTMLDivElement>) {
    const start = touch.current; const t = e.changedTouches[0];
    touch.current = null; setDrag(0);
    if (start?.horizontal || start?.vertical) { suppressClick.current = true; setTimeout(() => { suppressClick.current = false; }, 400); }
    if (start?.horizontal && !start.vertical && t && card && flipped && Math.abs(t.clientX - start.x) >= 56) rate(card, t.clientX > start.x ? 2 : 0);
  }

  function rate(c: Card, r: Rating) {
    if (busy) return;
    focusReview.current = true;
    if (mode === "cram") {
      // Cram never changes scheduling and records nothing.
      setQueue((q) => {
        const rest = (q ?? []).slice(1);
        return r === 0 ? [...rest, c] : rest;
      });
      setFlipped(false);
      if (r !== 0) setDone((d) => d + 1);
      setUndoStack((s) => [...s, { prev: c, counted: r !== 0 }]);
      return;
    }
    const next = previews?.[r];
    if (!next || card !== c) return;
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
      if (ok) refresh();
      if (!ok && !signal.cancelled) toast("Offline for now. Your rating is saved on this device and will sync automatically.", { id: "review-pending" });
      return ok;
    });
    setUndoStack((s) => [...s, { prev: c, counted: r !== 0, saved: { pending, inflight: { signal, promise } } }]);
  }

  async function undo() {
    const entry = undoStack.at(-1);
    if (!entry || busy) return;
    setBusy(true);
    try {
      if (entry.saved) await undoReview(entry.saved.pending, entry.prev, entry.saved.inflight);
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
      if (!flipped && (e.key === " " || e.key === "Enter")) { e.preventDefault(); reveal(); return; }
      if (flipped && ["1", "2", "3", "4"].includes(e.key)) { e.preventDefault(); rate(card, (Number(e.key) - 1) as Rating); return; }
      if (k === "e") { e.preventDefault(); setEditing(card); return; }
      if (k === "s") { e.preventDefault(); void hide(card, "suspend"); return; }
      if (k === "b") { e.preventDefault(); void hide(card, "bury"); return; }
      if (k === "r" && speechAvailable()) {
        const rt = allRoutes?.find((x) => x.id === card.route_id);
        if (rt?.type !== "language") return;
        e.preventDefault();
        speak(speakable(flipped ? card.back : card.front, flipped), rt.speech_lang);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function begin(m: Mode, cards: Card[]) {
    focusReview.current = true;
    setUndoStack([]);
    setDone(0);
    setFlipped(false);
    setMode(m);
    setQueue(cards);
  }
  async function startAhead() {
    const days = parseInt(aheadDays, 10);
    setLoadingExtra(true);
    try {
      const until = new Date(Date.now() + days * 86400000).toISOString();
      const cards = await fetchPaged<Card>((a, b) => {
        let q = liveCards()
          .or(`buried_until.is.null,buried_until.lte.${localDate()}`)
          .not("last_reviewed_at", "is", null)
          .gt("due_at", new Date().toISOString())
          .lte("due_at", until);
        if (route) q = q.eq("route_id", route);
        return q.order("due_at").order("id").range(a, b);
      });
      if (!cards.length) { toast(`Nothing due in the next ${days} day${days === 1 ? "" : "s"}.`); return; }
      begin("ahead", cards);
    } catch (e) {
      toast.error(`Couldn't load cards: ${(e as Error).message}`);
    } finally {
      setLoadingExtra(false);
    }
  }
  async function startCram(rid: string) {
    setLoadingExtra(true);
    try {
      const cards = await fetchPaged<Card>((a, b) => liveCards().eq("route_id", rid).order("id").range(a, b));
      if (!cards.length) { toast("That route has no active cards."); return; }
      begin("cram", shuffle(cards));
    } catch (e) {
      toast.error(`Couldn't load cards: ${(e as Error).message}`);
    } finally {
      setLoadingExtra(false);
    }
  }

  { const e = blockingError([routesError, allRoutes], [statsError, stats], [settingsError, newPerDay], [newError, newToday], [dueError, dueCards]); if (e) throw e; }
  if (!routes || !stats || !dueCards || newPerDay == null || newToday == null) return <ScreenSkeleton screen="review" />;
  const dueNow = dueCards.filter((c) => new Date(c.due_at).getTime() <= Date.now());
  const dueReviews = dueNow.filter((c) => c.last_reviewed_at);
  const newLeft = Math.max(0, newPerDay - newToday);
  const newCards = dueNow.filter((c) => !c.last_reviewed_at).sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, newLeft);
  const startCount = dueReviews.length + newCards.length;
  const totalCards = route ? Number(stats.get(route)?.cards_total ?? 0) : routes.reduce((a, r) => a + Number(stats.get(r.id)?.cards_total ?? 0), 0);
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
          <h1 className="page-title">Review complete.</h1>
          <p className="text-muted-foreground">{done} card{done === 1 ? "" : "s"} {mode === "cram" ? "crammed" : "reviewed"}. Steady progress.</p>
          <div className="flex justify-center gap-2">
            {undoButton}
            <Button className="h-12" onClick={() => { setQueue(null); setDone(0); setUndoStack([]); refresh(); }}>Done</Button>
          </div>
        </div>
      );
    }
    const cardRoute = allRoutes?.find((x) => x.id === card.route_id);
    const lang = cardRoute?.type === "language" ? cardRoute : null;
    return (
      <div className="mx-auto max-w-xl space-y-5">
        <div className="flex items-center justify-between gap-2 body-text text-muted-foreground">
          <span className="flex min-w-0 items-center gap-2"><RouteDot route={cardRoute ?? { id: card.route_id }} /><span className="truncate">{mode === "cram" ? "Cram · " : mode === "ahead" ? "Ahead · " : ""}{routeName(card.route_id)}</span></span>
          <div className="flex items-center gap-1">
            <span className="mr-2 whitespace-nowrap">{queue.length} left</span>
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
        <div role="progressbar" aria-label="Session progress" aria-valuemin={0} aria-valuemax={done + queue.length} aria-valuenow={done} aria-valuetext={`${done} done, ${queue.length} remaining`} className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary" style={{ width: `${100 * done / (done + queue.length)}%` }} />
        </div>
        {mode === "cram" && <p className="text-center meta-text text-muted-foreground">Cram mode: ratings aren't saved and don't change your schedule.</p>}
        <div onClick={() => { if (!suppressClick.current) reveal(); }} onTouchStart={touchStart} onTouchMove={touchMove} onTouchEnd={touchEnd} onTouchCancel={() => { touch.current = null; setDrag(0); }} style={{ transform: reducedMotion ? undefined : `translateX(${drag}px)`, touchAction: 'pan-y' }} className="surface flex min-h-72 w-full flex-col items-center justify-center gap-4 p-8 text-center shadow-sm">
          <div className="flex items-start justify-center gap-1">
            <CardText text={card.front} revealed={flipped} className="page-title" />
            {lang && <SpeakButton text={card.front} lang={lang.speech_lang} revealed={flipped} />}
          </div>
          {card.pronunciation && <p className="body-text text-muted-foreground">/{card.pronunciation}/</p>}
          <div aria-live="polite" aria-atomic="true" className="w-full">
          {flipped ? (
            <div className="review-reveal w-full space-y-3 border-t pt-4">
              <div className="flex items-start justify-center gap-1">
                <CardText text={card.back} className="text-lg" />
                {lang && <SpeakButton text={card.back} lang={lang.speech_lang} />}
              </div>
              {card.example && <CardText text={card.example} className="body-text italic text-muted-foreground" />}
            </div>
          ) : (
            <span className="body-text text-muted-foreground">Tap to reveal</span>
          )}
          </div>
        </div>
        {flipped ? (
          <div ref={ratingsRef} role="group" aria-label="Rate your recall" tabIndex={-1} className="grid grid-cols-4 gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {RATINGS.map(({ r, label }) => (
              <div key={r} className="space-y-1 text-center">
                <Button variant={r === 2 ? "default" : "outline"} className="h-14 w-full" disabled={busy} onClick={() => rate(card, r)} aria-describedby={mode !== 'cram' ? `interval-${r}` : undefined}>
                  {label} <kbd className="kbd-hint">{r + 1}</kbd>
                </Button>
                {mode !== 'cram' && previews && <p id={`interval-${r}`} className="meta-text text-muted-foreground" data-due-at={previews[r].due_at}>{intervalLabel(previews[r])}</p>}
              </div>
            ))}
          </div>
        ) : (
          <Button ref={showAnswerRef} className="h-14 w-full" onClick={reveal}>Show answer <kbd className="kbd-hint">Space</kbd></Button>
        )}
        <div className="flex items-center justify-between gap-2">
          {undoButton}
          <button className="tap px-3 body-text text-muted-foreground" onClick={() => { setQueue(null); setUndoStack([]); refresh(); }}>End session</button>
        </div>
        {editDialog}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div><h1 className="page-title">Review</h1>{route && <p className="mt-1 flex items-center gap-2 body-text text-muted-foreground"><RouteDot route={routes.find((r) => r.id === route) ?? { id: route }} />{routeName(route)}</p>}</div>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="h-12">
            <Link to="/cards" search={route ? { route } : {}}>Cards</Link>
          </Button>
          <Button variant="outline" className="h-12" onClick={() => setNewOpen(true)} disabled={!routes.length}>New card</Button>
        </div>
      </div>
      <NativeSelect aria-label="Review route" value={route ?? ""} onChange={(e) => navigate({ search: { route: e.target.value || undefined } })}>
        <option value="">All routes</option>
        {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </NativeSelect>
      {totalCards === 0 ? <Empty headingLevel={2} illustration="cards" title="No cards yet" description="Flashcards you add will be scheduled for review here." primaryAction={<Button onClick={() => setNewOpen(true)}>New card</Button>} secondaryLink={route ? <Link to="/routes/$id" params={{ id: route }}>Import CSV</Link> : <Link to="/routes">Open routes</Link>} /> : startCount === 0 ? <Empty headingLevel={2} illustration="cards" title="Nothing due right now" description={nextDueLabel(nextDue)} primaryAction={<Button asChild><Link to="/today">Back to Today</Link></Button>} /> : <div className="surface space-y-4 p-6 text-center">
        <p className="stat-text">{startCount}</p>
        <p className="text-muted-foreground">{startCount ? `${startCount} card${startCount > 1 ? "s" : ""} due. Keep climbing.` : "Nothing due right now."}</p>
        <p className="body-text text-muted-foreground">{newLeft} new card{newLeft === 1 ? "" : "s"} left today</p>
        {startCount ? (
          <Button className="h-12 w-full sm:w-auto sm:px-10" onClick={() => begin("review", [...orderQueue(dueReviews), ...newCards])}>Start review</Button>
        ) : (
          <Button className="h-12 w-full sm:w-auto sm:px-10" disabled>Start review</Button>
        )}
      </div>}
      {totalCards > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {startCount < 10 && (
            <div className="surface space-y-3 p-5">
              <div>
                <p className="card-title">Review ahead</p>
                <p className="body-text text-muted-foreground">Get ahead on cards coming due soon, earliest first.</p>
              </div>
              <NativeSelect value={aheadDays} onChange={(e) => setAheadDays(e.target.value)} aria-label="Review ahead window">
                <option value="1">Next 1 day</option>
                <option value="3">Next 3 days</option>
                <option value="7">Next 7 days</option>
              </NativeSelect>
              <Button variant="outline" className="h-12 w-full" disabled={loadingExtra} onClick={() => void startAhead()}>Review ahead</Button>
            </div>
          )}
          <div className="surface space-y-3 p-5">
            <div>
              <p className="card-title">Cram</p>
              <p className="body-text text-muted-foreground">All of a route's cards, shuffled. Nothing is saved; your schedule stays the same.</p>
            </div>
            <NativeSelect value={cramRoute || route || ""} onChange={(e) => setCramRoute(e.target.value)} aria-label="Cram route">
              <option value="" disabled>Choose a route</option>
              {routes.filter((r) => (stats.get(r.id)?.cards_total ?? 0) > 0).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </NativeSelect>
            <Button variant="outline" className="h-12 w-full" disabled={loadingExtra || !(cramRoute || route)} onClick={() => void startCram(cramRoute || route!)}>Start cram</Button>
          </div>
        </div>
      )}

      <CardDialog open={newOpen} onOpenChange={setNewOpen} {...(route ? { routeId: route } : {})} />
    </div>
  );
}
