import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { RouteRow } from "@/lib/data";
import { requireOnline } from "@/lib/sync";
import { useSubmission } from "@/hooks/use-submission";
import { Button } from "@/components/ui/button";
import { HabitReminderFields } from "./HabitReminderFields";
import { ensureReminderTimezone } from "@/lib/reminderTimezone";

export function HabitReminderSettings({ route }: { route: RouteRow }) {
  const [enabled, setEnabled] = useState(route.reminder_enabled);
  const [time, setTime] = useState(route.reminder_time.slice(0,5));
  const qc = useQueryClient();
  const { submitting, submit } = useSubmission();
  useEffect(() => { setEnabled(route.reminder_enabled); setTime(route.reminder_time.slice(0,5)); }, [route.reminder_enabled, route.reminder_time]);
  return <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submit(async () => {
    if (!requireOnline("Saving a reminder")) return;
    if (enabled) await ensureReminderTimezone(qc);
    const { error } = await supabase.from("routes").update({ reminder_enabled: enabled, reminder_time: time || "19:00" }).eq("id", route.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Reminder saved."); void qc.invalidateQueries({ queryKey: ["routes"] });
  }); }}>
    <HabitReminderFields enabled={enabled} time={time} onEnabled={(next) => { if (!next) { setEnabled(false); return; } void submit(async () => { if (!requireOnline("Enabling a reminder")) return; await ensureReminderTimezone(qc); setEnabled(true); }); }} onTime={setTime} disabled={submitting} />
    <Button type="submit" className="h-12" disabled={submitting || (enabled === route.reminder_enabled && time === route.reminder_time.slice(0,5))}>Save reminder</Button>
  </form>;
}