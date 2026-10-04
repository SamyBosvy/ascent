import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isLive, useRefresh, useRoutes, type Card } from "@/lib/data";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "./fields";

export function CardDialog({
  open,
  onOpenChange,
  routeId: fixedRoute,
  initialFront = "",
  card,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  routeId?: string;
  initialFront?: string;
  /** Edit mode: the card to edit. */
  card?: Card | null;
  onSaved?: (card: Card) => void;
}) {
  const { data: routes_ } = useRoutes();
  // Archived routes are hidden, except the one the edited card already belongs to.
  const data = routes_ ? { routes: routes_.filter((r) => isLive(r) || r.id === card?.route_id) } : undefined;
  const refresh = useRefresh();
  const [routeId, setRouteId] = useState(fixedRoute ?? "");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [example, setExample] = useState("");
  const [pron, setPron] = useState("");

  useEffect(() => {
    if (open) {
      setFront(card?.front ?? initialFront);
      setBack(card?.back ?? "");
      setExample(card?.example ?? "");
      setPron(card?.pronunciation ?? "");
      setRouteId(card?.route_id ?? fixedRoute ?? data?.routes[0]?.id ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const route = data?.routes.find((r) => r.id === routeId);
  const isLang = route?.type === "language";

  async function save(e: React.FormEvent, again = false) {
    e.preventDefault();
    if (!front.trim() || !back.trim() || !routeId) return;
    if (card) {
      const patch = { front: front.trim(), back: back.trim(), example: isLang && example ? example : null, pronunciation: isLang && pron ? pron : null };
      const { error } = await supabase.from("cards").update(patch).eq("id", card.id);
      if (error) { toast.error(error.message); return; }
      if (routeId !== card.route_id) {
        const { error: mErr } = await supabase.rpc("move_cards", { _ids: [card.id], _route: routeId });
        if (mErr) { toast.error(`Saved, but couldn't move it: ${mErr.message}`); }
      }
      toast.success("Card updated.");
      onSaved?.({ ...card, ...patch, route_id: routeId });
      refresh();
      onOpenChange(false);
      return;
    }
    const { error } = await supabase.from("cards").insert({
      route_id: routeId,
      front: front.trim(),
      back: back.trim(),
      example: isLang && example ? example : null,
      pronunciation: isLang && pron ? pron : null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Card added.");
    refresh();
    if (again) {
      setFront("");
      setBack("");
      setExample("");
      setPron("");
    } else onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{card ? "Edit flashcard" : "New flashcard"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => save(e)} className="space-y-4">
          {(!fixedRoute || card) && (
            <div className="space-y-2">
              <Label>Route</Label>
              <NativeSelect value={routeId} onChange={(e) => setRouteId(e.target.value)}>
                {data?.routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </NativeSelect>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="cf">Front</Label>
            <Textarea id="cf" required rows={2} value={front} onChange={(e) => setFront(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cb">Back</Label>
            <Textarea id="cb" required rows={2} value={back} onChange={(e) => setBack(e.target.value)} />
          </div>
          {isLang && (
            <>
              <div className="space-y-2">
                <Label htmlFor="ce">Example sentence (optional)</Label>
                <Input id="ce" className="h-12" value={example} onChange={(e) => setExample(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp">Pronunciation (optional)</Label>
                <Input id="cp" className="h-12" value={pron} onChange={(e) => setPron(e.target.value)} />
              </div>
            </>
          )}
          <div className="flex gap-2">
            {!card && <Button type="button" variant="outline" className="h-12 flex-1" onClick={(e) => front && back && save(e, true)}>Save & add another</Button>}
            <Button type="submit" className="h-12 flex-1">Save</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
