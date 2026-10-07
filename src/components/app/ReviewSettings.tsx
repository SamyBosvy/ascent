import { useSubmission } from "@/hooks/use-submission";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useNewPerDay } from "@/lib/data";
import { SectionTitle } from "./fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ReviewSettings() {
  const { data: current } = useNewPerDay();
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (current != null) setValue(String(current)); }, [current]);

  const valid = /^\d+$/.test(value.trim()) && Number(value) <= 1000;

  const { submitting: submittingSave, submit: submitSave } = useSubmission();
  function save(e: React.FormEvent) { e.preventDefault(); return submitSave(() => saveRequest(e)); }
  async function saveRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setBusy(false); toast.error("Please sign in again."); return; }
    const { error } = await supabase.from("user_settings").upsert({ user_id: u.user.id, new_per_day: Number(value) });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved.");
    void qc.invalidateQueries({ queryKey: ["user-settings"] });
  }

  return (
    <section>
      <SectionTitle>Review</SectionTitle>
      <form onSubmit={save} className="surface flex flex-wrap items-end gap-3 p-4">
        <div className="space-y-2">
          <Label htmlFor="npd">New cards per day</Label>
          <Input id="npd" inputMode="numeric" className="h-12 w-32" value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={!valid} />
        </div>
        <Button type="submit" className="h-12" disabled={!valid || busy || submittingSave || Number(value) === current}>Save</Button>
        <p className="w-full text-xs text-muted-foreground">{valid ? "Due reviews always come first; new cards fill in after them." : "Enter a whole number from 0 to 1000."}</p>
      </form>
    </section>
  );
}
