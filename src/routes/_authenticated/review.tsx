import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchPaged, localDate, useRefresh, useRouteStats, useRoutes, isLive, type Card } from "@/lib/data";
import { saveReview } from "@/lib/reviewQueue";
import { sm2, type Rating } from "@/lib/srs";
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

function Review() {
  const { route } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: allRoutes } = useRoutes();
  const routes = allRoutes?.filter(isLive);
  const { data: stats } = useRouteStats();
  const { data: dueCards } = useQuery({
    queryKey: ["cards", "due", route ?? "all"],
    queryFn: () =>
      fetchPaged<Card>((a, b) => {
        let q = supabase.from("cards").select("*, routes!inner(id)").is("routes.archived_at", null).is("routes.deleted_at", null).lte("due_at", new Date().toISOString());
        if (route) q = q.eq("route_id", route);
        return q.order("due_at").order("id").range(a, b);
      }),
  });
  const refresh = useRefresh();
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const [newOpen, setNewOpen] = useState(false);

  if (!routes || !stats || !dueCards) return <p className="text-muted-foreground">Loading…</p>;
  const dueAll = dueCards.filter((c) => new Date(c.due_at).getTime() <= Date.now());
  const totalCards = [...stats.values()].reduce((a, s) => a + s.cards_total, 0);
  const routeName = (rid: string) => routes.find((r) => r.id === rid)?.name ?? "";

  function rate(card: Card, r: Rating) {
    const next = sm2(card, r);
    // Optimistic: move on immediately with the new schedule applied locally.
    const rest = queue!.slice(1);
    setQueue(r === 0 ? [...rest, { ...card, ...next }] : rest);
    setFlipped(false);
    if (r !== 0) setDone((d) => d + 1);
    // Durable: queued in localStorage first, retried, and re-sent on next load / when back online.
    void saveReview({ id: crypto.randomUUID(), card_id: card.id, rating: r, ...next, reviewed_at: new Date().toISOString() }).then((ok) => {
      if (!ok) toast("Offline for now. Your rating is saved on this device and will sync automatically.", { id: "review-pending" });
    });
  }

  if (queue) {
    const card = queue[0];
    if (!card) {
      return (
        <div className="mx-auto max-w-md space-y-4 pt-10 text-center">
          <h1 className="text-3xl font-semibold">Review complete.</h1>
          <p className="text-muted-foreground">{done} card{done === 1 ? "" : "s"} reviewed. Steady progress.</p>
          <Button className="h-12" onClick={() => { setQueue(null); setDone(0); refresh(); }}>Done</Button>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-xl space-y-5">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{routeName(card.route_id)}</span>
          <span>{queue.length} left</span>
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
              <Button key={r} variant={r === 2 ? "default" : "outline"} className="h-14" onClick={() => rate(card, r)}>{label}</Button>
            ))}
          </div>
        ) : (
          <Button className="h-14 w-full" onClick={() => setFlipped(true)}>Show answer</Button>
        )}
        <button className="tap w-full text-sm text-muted-foreground" onClick={() => { setQueue(null); refresh(); }}>End session</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Review</h1>
        <Button variant="outline" className="h-12" onClick={() => setNewOpen(true)} disabled={!routes.length}>New card</Button>
      </div>
      <NativeSelect value={route ?? ""} onChange={(e) => navigate({ search: { route: e.target.value || undefined } })}>
        <option value="">All routes</option>
        {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </NativeSelect>
      <div className="surface space-y-4 p-6 text-center">
        <p className="font-display text-5xl font-semibold">{dueAll.length}</p>
        <p className="text-muted-foreground">{dueAll.length ? `${dueAll.length} card${dueAll.length > 1 ? "s" : ""} due. Keep climbing.` : "Nothing due right now."}</p>
        <Button className="h-12 w-full sm:w-auto sm:px-10" disabled={!dueAll.length} onClick={() => setQueue(orderQueue(dueAll))}>Start review</Button>
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
