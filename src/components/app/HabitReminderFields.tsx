import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function HabitReminderFields({ enabled, time, onEnabled, onTime, disabled = false }: { enabled: boolean; time: string; onEnabled: (enabled: boolean) => void; onTime: (time: string) => void; disabled?: boolean }) {
  const id = useId();
  return <div className="space-y-3">
    <div className="flex min-h-12 items-center justify-between gap-3"><Label htmlFor={`${id}-on`}>Reminder</Label><div className="flex min-h-12 min-w-12 items-center justify-center"><Switch id={`${id}-on`} checked={enabled} onCheckedChange={onEnabled} disabled={disabled} /></div></div>
    <div className="space-y-2"><Label htmlFor={`${id}-time`}>Reminder time</Label><Input id={`${id}-time`} type="time" className="h-12" value={time.slice(0,5)} onChange={(event) => onTime(event.target.value)} disabled={disabled || !enabled} required={enabled} /></div>
  </div>;
}