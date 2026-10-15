import { RouteDot } from "@/components/app/RouteDot";
import { useSubmission } from "@/hooks/use-submission";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Pause } from "lucide-react";
import { toast } from "sonner";
import { minutesLabel, useRefresh, useRoutes } from "@/lib/data";
import { logSession, minutesError, SESSION_MAX_MINUTES } from "@/lib/sessions";
import { clockLabel, elapsedMs, timer, useTimer } from "@/lib/timer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Small "session running" pill that links back to the route being timed. */
export function SessionPill({ className = "" }: { className?: string }) {
  const { state, elapsed } = useTimer();
  const { data: routes } = useRoutes();
  if (!state) return null;
  return (
    <Link
      to="/routes/$id"
      params={{ id: state.routeId }}
      className={`flex min-h-12 items-center gap-2 rounded-full border bg-background px-4 text-sm shadow-sm ${className}`}
      aria-label={`${state.paused ? "Paused" : "Running"} session on ${state.routeName}, ${clockLabel(elapsed)}`}
    >
      <RouteDot route={routes?.find((r) => r.id === state.routeId) ?? { id: state.routeId }} />
      <span className="flex size-4 shrink-0 items-center justify-center text-primary-strong" title={state.paused ? "Paused" : "Running"} aria-hidden="true">
        {state.paused ? <Pause className="size-4" /> : <span className="session-running size-2 rounded-full border-2 border-primary-strong" />}
      </span>
      <span className="min-w-0 truncate">{state.routeName}</span>
      <span className="font-medium tabular-nums">{clockLabel(elapsed)}</span>
    </Link>
  );
}

const TWELVE_H = 12 * 3600 * 1000;

/** On app open, ask what to do with a session left running for more than 12 hours. */
export function StaleSessionPrompt() {
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState(0);
  const [capped, setCapped] = useState(false);
  const [minutes, setMinutes] = useState("");

  useEffect(() => {
    const s = timer.get();
    const ms = elapsedMs(s);
    if (s && ms > TWELVE_H) {
      setHours(Math.floor(ms / 3600000));
      setCapped(ms > 2 * TWELVE_H);
      setMinutes(String(Math.min(Math.round(ms / 60000), SESSION_MAX_MINUTES)));
      setOpen(true);
    }
  }, []);

  const err = minutesError(minutes);
  const { submitting: submittingStale, submit: submitStale } = useSubmission();
  function save() { if (err) return; return submitStale(() => saveRequest(parseInt(minutes, 10))); }
  async function saveRequest(mins: number) {
    const s = timer.get();
    if (!s) { setOpen(false); return; }
    try { await logSession({ route_id: s.routeId, minutes: mins }); } catch (e) { toast.error((e as Error).message); return; }
    timer.clear();
    toast.success(`${minutesLabel(mins)} logged.`);
    refresh();
    setOpen(false);
  }

  const name = timer.get()?.routeName ?? "";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Session still running</DialogTitle>
          <DialogDescription>You left a session running for {hours}h on {name}. How many minutes did you actually spend?</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="space-y-2">
            <Label htmlFor="stale-min">Minutes</Label>
            <Input id="stale-min" name="session-minutes" type="number" inputMode="numeric" min={1} max={SESSION_MAX_MINUTES} required className="h-12" value={minutes} onChange={(e) => setMinutes(e.target.value)} aria-invalid={!!err} aria-describedby={err ? "stale-min-err" : undefined} />
            {err && <p id="stale-min-err" className="meta-text text-destructive-strong">{err}</p>}
            {capped && <p className="meta-text text-muted-foreground">Capped at 24 hours. Change it if you studied less.</p>}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="submit" disabled={!!err || submittingStale} className="h-12">Save</Button>
            <Button type="button" variant="outline" className="h-12" onClick={() => { timer.clear(); setOpen(false); }}>Discard</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
