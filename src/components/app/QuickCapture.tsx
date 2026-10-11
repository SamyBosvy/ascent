import { useSubmission } from "@/hooks/use-submission";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isLive, useRefresh, useRoutes } from "@/lib/data";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useNavigate } from "@tanstack/react-router";
import { InlineSkeleton } from "./ScreenSkeleton";
import { Empty, NativeSelect } from "./fields";
import { logSession, minutesError, SESSION_MAX_MINUTES } from "@/lib/sessions";
import { requireOnline } from "@/lib/sync";
import { haptic } from "@/lib/feedback";
import { successFeedback } from "./SuccessTick";

const LAST_KEY = "ascent:last-route";

export function QuickCapture({ open, onOpenChange, initialKind = 'note', initialRouteId }: { open: boolean; onOpenChange: (o: boolean) => void; initialKind?: 'note' | 'session'; initialRouteId?: string | undefined }) {
  const formId = useId();
  const navigate = useNavigate();
  const { data: routes_, error: routesError } = useRoutes();
  const data = routes_ ? { routes: routes_ } : undefined;
  const refresh = useRefresh();
  const routes = (data?.routes ?? []).filter((r) => isLive(r) && (r.status === "active" || r.status === "paused"));
  const [kind, setKind] = useState<"note" | "session">("note");
  const [routeId, setRouteId] = useState("");
  const [text, setText] = useState("");
  const [minutes, setMinutes] = useState("25");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const last = localStorage.getItem(LAST_KEY);
    setKind(initialKind);
    setRouteId(routes.find((r) => r.id === initialRouteId)?.id ?? routes.find((r) => r.id === last)?.id ?? routes[0]?.id ?? "");
    setText("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const minutesErr = kind === "session" ? minutesError(minutes) : null;
  const { submitting: submittingSave, submit: submitSave } = useSubmission();
  function save(e: React.FormEvent) { e.preventDefault(); return submitSave(async () => {
    try { await saveRequest(e); }
    catch (error) { haptic("warning"); toast.error((error as Error).message); }
    finally { setBusy(false); }
  }); }
  async function saveRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!routeId) return;
    if (kind === "session" && minutesErr) return;
    if (kind === "note" && !requireOnline("Saving a note")) { haptic("warning"); return; }
    setBusy(true);
    localStorage.setItem(LAST_KEY, routeId);
    let error: { message: string } | null = null;
    if (kind === "note") {
      ({ error } = await supabase.from("notes").insert({ route_id: routeId, title: (text.split("\n")[0] ?? "").slice(0, 80), body: text }));
    } else {
      try { await logSession({ route_id: routeId, minutes: parseInt(minutes, 10), note: text || null }); } catch (e) { error = e as Error; }
    }
    setBusy(false);
    if (error) { haptic("warning"); toast.error(error.message); return; }
    if (kind === "session") successFeedback("Session logged. Keep climbing.");
    else toast.success("Note saved.");
    refresh();
    onOpenChange(false);
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={kind === "session" ? "Log time" : "Quick capture"} submitting={busy || submittingSave} className="sm:max-w-md" footer={routes.length > 0 && !routesError ? <Button form={formId} type="submit" className="h-12 w-full" disabled={busy || submittingSave || !!minutesErr}>Save</Button> : undefined}>
        {routesError ? <p role="alert" className="body-text text-muted-foreground">Couldn’t load routes.</p> : !routes_ ? <InlineSkeleton /> : routes.length === 0 ? (
          <Empty headingLevel={2} illustration="tent" title="No active routes" description="Choose a route before saving notes or study time." primaryAction={<Button onClick={() => { onOpenChange(false); navigate({ to: "/routes" }); }}>Open routes</Button>} />
        ) : (
          <form id={formId} onSubmit={save} className="space-y-4">
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
                <Input id="qc-min" type="number" inputMode="numeric" min={1} max={SESSION_MAX_MINUTES} value={minutes} onChange={(e) => setMinutes(e.target.value)} className="h-12" aria-invalid={!!minutesErr} aria-describedby={minutesErr ? "qc-min-err" : undefined} />
                {minutesErr && <p id="qc-min-err" className="meta-text text-destructive-strong">{minutesErr}</p>}
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
          </form>
        )}
    </ResponsiveDialog>
  );
}
