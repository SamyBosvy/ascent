import { useSubmission } from "@/hooks/use-submission";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isLive, useRefresh, useRoutes, type Card } from "@/lib/data";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "./fields";
import { CardText } from "./CardText";
import { Checkbox } from "@/components/ui/checkbox";
import { hasCloze } from "@/lib/cardText";

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
  const formId = useId();
  const { data: routes_ } = useRoutes();
  // Archived routes are hidden, except the one the edited card already belongs to.
  const data = routes_ ? { routes: routes_.filter((r) => isLive(r) || r.id === card?.route_id) } : undefined;
  const refresh = useRefresh();
  const [routeId, setRouteId] = useState(fixedRoute ?? "");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [example, setExample] = useState("");
  const [pron, setPron] = useState("");
  const [reverse, setReverse] = useState(false);

  useEffect(() => {
    if (open) {
      setFront(card?.front ?? initialFront);
      setBack(card?.back ?? "");
      setExample(card?.example ?? "");
      setPron(card?.pronunciation ?? "");
      setReverse(false);
      setRouteId(card?.route_id ?? fixedRoute ?? data?.routes[0]?.id ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const route = data?.routes.find((r) => r.id === routeId);
  const isLang = route?.type === "language";

  const { submitting: submittingSave, submit: submitSave } = useSubmission();
  function save(e: React.FormEvent, again = false) { e.preventDefault(); return submitSave(() => saveRequest(e, again)); }
  async function saveRequest(e: React.FormEvent, again = false) {
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
    const base = { route_id: routeId, example: isLang && example ? example : null, pronunciation: isLang && pron ? pron : null };
    const rows = [{ ...base, front: front.trim(), back: back.trim() }];
    if (reverse && !hasCloze(front)) rows.push({ ...base, front: back.trim(), back: front.trim(), pronunciation: null });
    const { error } = await supabase.from("cards").insert(rows);
    if (error) { toast.error(error.message); return; }
    toast.success(reverse ? "Card and reverse card added." : "Card added.");
    refresh();
    if (again) {
      setFront("");
      setBack("");
      setExample("");
      setPron("");
    } else onOpenChange(false);
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={card ? "Edit flashcard" : "New flashcard"} submitting={submittingSave} className="sm:max-w-md" footer={<div className="flex gap-2">
            {!card && <Button disabled={submittingSave} type="button" variant="outline" className="h-12 flex-1" onClick={(e) => front && back && save(e, true)}>Save & add another</Button>}
            <Button disabled={submittingSave} form={formId} type="submit" className="h-12 flex-1">Save</Button>
          </div>}>
        <form id={formId} onSubmit={(e) => save(e)} className="space-y-4">
          {(!fixedRoute || card) && (
            <div className="space-y-2">
              <Label htmlFor="card-route">Route</Label>
              <NativeSelect id="card-route" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
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
          <p className="meta-text text-muted-foreground">Markdown works: **bold**, *italics*, lists, `code`. Cloze: {"{{c1::answer}}"} or {"{{c1::answer::hint}}"} in the front.</p>
          {!card && (
            <label htmlFor="card-reverse" className="flex min-h-12 items-center gap-3 label-text">
              <Checkbox id="card-reverse" checked={reverse} disabled={hasCloze(front)} onCheckedChange={(v) => setReverse(!!v)} /> Also create reverse card
            </label>
          )}
          {(front.trim() || back.trim()) && (
            <div className="space-y-2 rounded-md border border-dashed p-3 body-text">
              <p className="meta-text text-muted-foreground">Preview</p>
              {front.trim() && <CardText text={front} revealed={false} className="card-title" />}
              {back.trim() && <CardText text={back} className="border-t pt-2" />}
              {isLang && example.trim() && <CardText text={example} className="italic text-muted-foreground" />}
            </div>
          )}

        </form>
    </ResponsiveDialog>
  );
}
