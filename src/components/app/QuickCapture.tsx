import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAll, useRefresh } from "@/lib/data";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "./fields";

const LAST_KEY = "ascent:last-route";

export function QuickCapture({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data } = useAll();
  const refresh = useRefresh();
  const routes = (data?.routes ?? []).filter((r) => r.status === "active" || r.status === "paused");
  const [kind, setKind] = useState<"note" | "session">("note");
  const [routeId, setRouteId] = useState("");
  const [text, setText] = useState("");
  const [minutes, setMinutes] = useState("25");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const last = localStorage.getItem(LAST_KEY);
    setRouteId(routes.find((r) => r.id === last)?.id ?? routes[0]?.id ?? "");
    setText("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!routeId) return;
    setBusy(true);
    localStorage.setItem(LAST_KEY, routeId);
    const { error } =
      kind === "note"
        ? await supabase.from("notes").insert({ route_id: routeId, title: text.split("\n")[0].slice(0, 80), body: text })
        : await supabase.from("sessions").insert({ route_id: routeId, minutes: Math.max(1, parseInt(minutes) || 0), note: text || null });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(kind === "note" ? "Note saved." : "Session logged. Keep climbing.");
    refresh();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick capture</DialogTitle>
        </DialogHeader>
        {routes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Create a Route first, then capture notes and sessions here.</p>
        ) : (
          <form onSubmit={save} className="space-y-4">
            <Tabs value={kind} onValueChange={(v) => setKind(v as "note" | "session")}>
              <TabsList className="grid h-12 w-full grid-cols-2">
                <TabsTrigger value="note" className="h-10">Note</TabsTrigger>
                <TabsTrigger value="session" className="h-10">Session</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="space-y-2">
              <Label htmlFor="qc-route">Route</Label>
              <NativeSelect id="qc-route" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </NativeSelect>
            </div>
            {kind === "session" && (
              <div className="space-y-2">
                <Label htmlFor="qc-min">Minutes</Label>
                <Input id="qc-min" type="number" inputMode="numeric" min={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} className="h-12" />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="qc-text">{kind === "note" ? "Note (markdown)" : "One-line note (optional)"}</Label>
              {kind === "note" ? (
                <Textarea id="qc-text" autoFocus required rows={5} value={text} onChange={(e) => setText(e.target.value)} />
              ) : (
                <Input id="qc-text" value={text} onChange={(e) => setText(e.target.value)} className="h-12" />
              )}
            </div>
            <Button type="submit" className="h-12 w-full" disabled={busy}>Save</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
