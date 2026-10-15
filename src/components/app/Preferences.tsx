import { useSubmission } from "@/hooks/use-submission";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useUserSettings } from "@/lib/data";
import { setPrefs, setVibrationEnabled, vibrationEnabled, type Theme } from "@/lib/prefs";
import { browserTimeZone, isValidTimeZone, type WeekStart } from "@/lib/time";
import { NativeSelect, SectionTitle } from "./fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PushPreferences } from "./PushPreferences";

function allZones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone");
  } catch {
    return [browserTimeZone(), "UTC"];
  }
}

const whole = (v: string, min: number, max: number) => /^\d+$/.test(v.trim()) && Number(v) >= min && Number(v) <= max;

export function Preferences() {
  const { data: s } = useUserSettings();
  const qc = useQueryClient();
  const zones = useMemo(allZones, []);
  const [theme, setTheme] = useState<Theme>("system");
  const [week, setWeek] = useState<WeekStart>(1);
  const [tz, setTz] = useState("");
  const [goal, setGoal] = useState("");
  const [npd, setNpd] = useState("");
  const [vibration, setVibration] = useState(true);
  useEffect(() => { setVibration(vibrationEnabled()); }, []);
  useEffect(() => {
    if (!s) return;
    setTheme(s.theme); setWeek(s.week_start); setTz(s.timezone);
    setGoal(s.daily_goal ? String(s.daily_goal) : ""); setNpd(String(s.new_per_day));
  }, [s]);

  const tzOk = isValidTimeZone(tz) && (zones.includes(tz) || tz === "UTC");
  const goalOk = goal.trim() === "" || whole(goal, 1, 1000);
  const npdOk = whole(npd, 0, 1000);
  const valid = tzOk && goalOk && npdOk;
  const changed = !!s && (theme !== s.theme || week !== s.week_start || tz !== s.timezone || !s.timezone_set || (goal.trim() ? Number(goal) : null) !== s.daily_goal || Number(npd) !== s.new_per_day);

  const { submitting, submit } = useSubmission();
  function save(e: React.FormEvent) {
    e.preventDefault();
    return submit(async () => {
      if (!valid) return;
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { toast.error("Please sign in again."); return; }
      const row = { user_id: u.user.id, theme, week_start: week, timezone: tz, daily_goal: goal.trim() ? Number(goal) : null, new_per_day: Number(npd) };
      const { error } = await supabase.from("user_settings").upsert(row);
      if (error) { toast.error(error.message); return; }
      const datesChanged = setPrefs({ theme, weekStart: week, tz });
      toast.success("Preferences saved.");
      await qc.invalidateQueries({ queryKey: ["user-settings"] });
      if (datesChanged) void qc.invalidateQueries();
    });
  }

  return (
    <section>
      <SectionTitle>Preferences</SectionTitle>
      <form onSubmit={save} className="surface grid gap-4 p-4 sm:grid-cols-2">
        <div className="flex min-h-12 items-center justify-between gap-3 sm:col-span-2">
          <Label htmlFor="pref-vibration" className="flex min-h-12 flex-1 items-center">Vibration feedback</Label>
          <div className="flex min-h-12 min-w-12 items-center justify-center"><Switch id="pref-vibration" checked={vibration} onCheckedChange={(enabled) => { setVibration(enabled); setVibrationEnabled(enabled); }} /></div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pref-theme">Theme</Label>
          <NativeSelect id="pref-theme" value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pref-week">Week starts on</Label>
          <NativeSelect id="pref-week" value={String(week)} onChange={(e) => setWeek(e.target.value === "0" ? 0 : 1)}>
            <option value="1">Monday</option>
            <option value="0">Sunday</option>
          </NativeSelect>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="pref-tz">Timezone</Label>
          <Input id="pref-tz" name="timezone" list="pref-tz-list" className="h-12" value={tz} onChange={(e) => setTz(e.target.value)} aria-invalid={!tzOk} aria-describedby="pref-tz-help" autoComplete="off" />
          <datalist id="pref-tz-list">{zones.map((z) => <option key={z} value={z} />)}</datalist>
          <p id="pref-tz-help" className="meta-text text-muted-foreground">{tzOk ? "Sets when your day starts for check-ins, new cards and goals." : "Pick a timezone from the list, e.g. Europe/Paris."}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pref-goal">Daily review goal (cards)</Label>
          <Input id="pref-goal" name="daily-goal" inputMode="numeric" className="h-12" placeholder="Off" value={goal} onChange={(e) => setGoal(e.target.value)} aria-invalid={!goalOk} aria-describedby="pref-goal-help" />
          <p id="pref-goal-help" className="meta-text text-muted-foreground">{goalOk ? "Leave empty to turn it off." : "Enter a whole number from 1 to 1000, or leave empty."}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="npd">New cards per day</Label>
          <Input id="npd" name="new-per-day" inputMode="numeric" className="h-12" value={npd} onChange={(e) => setNpd(e.target.value)} aria-invalid={!npdOk} aria-describedby="npd-help" />
          <p id="npd-help" className="meta-text text-muted-foreground">{npdOk ? "Due reviews always come first; new cards fill in after them." : "Enter a whole number from 0 to 1000."}</p>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" className="h-12" disabled={!valid || !changed || submitting}>Save preferences</Button>
        </div>
      </form>
      <PushPreferences />
    </section>
  );
}
