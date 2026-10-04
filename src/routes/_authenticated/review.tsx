import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAll, useRefresh, type Card } from "@/lib/data";
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

function Review() {
  const { route } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data } = useAll();
  const refresh = useRefresh();
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const [newOpen, setNewOpen] = useState(false);

  const dueAll = useMemo(
    () => (data?.cards ?? []).filter((c) => new Date(c.due_at).getTime() <= Date.now() && (!route || c.route_id === route)),
    [data, route],
  );

  if (!data) return <p className="text-muted-foreground">Loading…</p>;
  const routeName = (rid: string) => data.routes.find((r) => r.id === rid)?.name ?? "";

  async function rate(card: Card, r: Rating) {
    const next = sm2(card, r);
    const rest = queue!.slice(1);
    setQueue(r === 0 ? [...rest, { ...card, ...next }] : rest);
    setFlipped(false);
    if (r !== 0) setDone((d) => d + 1);
    const [a, b] = await Promise.all([
      supabase.from("cards").update(next).eq("id", card.id),
      supabase.from("reviews").insert({ card_id: card.id, route_id: card.route_id, rating: r }),
    ]);
    if (a.error || b.error) toast.error((a.error ?? b.error)!.message);
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
        <Button variant="outline" className="h-12" onClick={() => setNewOpen(true)} disabled={!data.routes.length}>New card</Button>
      </div>
      <NativeSelect value={route ?? ""} onChange={(e) => navigate({ search: { route: e.target.value || undefined } })}>
        <option value="">All routes</option>
        {data.routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </NativeSelect>
      <div className="surface space-y-4 p-6 text-center">
        <p className="font-display text-5xl font-semibold">{dueAll.length}</p>
        <p className="text-muted-foreground">{dueAll.length ? `${dueAll.length} card${dueAll.length > 1 ? "s" : ""} due. Keep climbing.` : "Nothing due right now."}</p>
        <Button className="h-12 w-full sm:w-auto sm:px-10" disabled={!dueAll.length} onClick={() => setQueue([...dueAll].sort(() => Math.random() - 0.5))}>Start review</Button>
      </div>
      {!data.cards.length && (
        <Empty>
          No cards yet. Add them from a <Link to="/routes" className="text-primary underline">route</Link>, a note, or a CSV import.
        </Empty>
      )}
      <CardDialog open={newOpen} onOpenChange={setNewOpen} routeId={route} />
    </div>
  );
}
