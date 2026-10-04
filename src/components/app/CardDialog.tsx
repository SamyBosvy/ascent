import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRefresh, useRoutes } from "@/lib/data";
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
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  routeId?: string;
  initialFront?: string;
}) {
  const { data: routes_ } = useRoutes();
  const data = routes_ ? { routes: routes_ } : undefined;
  const refresh = useRefresh();
  const [routeId, setRouteId] = useState(fixedRoute ?? "");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [example, setExample] = useState("");
  const [pron, setPron] = useState("");

  useEffect(() => {
    if (open) {
      setFront(initialFront);
      setBack("");
      setExample("");
      setPron("");
      setRouteId(fixedRoute ?? data?.routes[0]?.id ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const route = data?.routes.find((r) => r.id === routeId);
  const isLang = route?.type === "language";

  async function save(e: React.FormEvent, again = false) {
    e.preventDefault();
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
          <DialogTitle>New flashcard</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => save(e)} className="space-y-4">
          {!fixedRoute && (
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
            <Button type="button" variant="outline" className="h-12 flex-1" onClick={(e) => front && back && save(e, true)}>Save & add another</Button>
            <Button type="submit" className="h-12 flex-1">Save</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
