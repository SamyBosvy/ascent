import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSubmission } from "@/hooks/use-submission";
import { requireOnline } from "@/lib/sync";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/push";

const COPY: Record<PushState, string> = {
  loading: "Checking notifications…", enabled: "Notifications enabled on this device.", available: "Notifications are off on this device.",
  blocked: "Notifications are blocked. Allow notifications in your browser’s site settings, then reopen Ascent.",
  unsupported: "This browser does not support web push. On iPhone or iPad, add Ascent to the Home Screen first.",
  install: "Add Ascent to the Home Screen, then open it there to enable notifications.",
  "host-unavailable": "Notifications are unavailable on this host. Open the published Ascent app to enable them.",
};
export function PushPreferences() {
  const [state, setState] = useState<PushState>("loading");
  const { submitting, submit } = useSubmission();
  useEffect(() => { void pushState().then(setState).catch(() => setState("host-unavailable")); }, []);
  function change() { return submit(async () => {
    if (!requireOnline("Changing notifications")) return;
    try { setState(await (state === "enabled" ? disablePush() : enablePush())); }
    catch (error) { toast.error((error as Error).message); }
  }); }
  return <section className="mt-6 space-y-3" aria-labelledby="habit-reminders-heading">
    <h3 id="habit-reminders-heading" className="section-title">Habit reminders</h3>
    <p role="status" className="body-text text-muted-foreground">{COPY[state]}</p>
    {(state === "enabled" || state === "available") && <Button className="h-12" disabled={submitting} onClick={change}>{state === "enabled" ? "Disable notifications" : "Enable notifications"}</Button>}
  </section>;
}