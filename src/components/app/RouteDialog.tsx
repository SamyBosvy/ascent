import { useSubmission } from "@/hooks/use-submission";
import { requireOnline } from "@/lib/sync";
import { markOnboarding, useOnboarding } from "@/lib/onboarding";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRoutes, TYPE_LABEL, type RouteRow, type RouteType } from "@/lib/data";
import { SPEECH_LANGS, SPEECH_LANG_RE } from "@/lib/cardText";
import { NativeSelect } from "@/components/app/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const LIMITS = { pages: 20000, chapters: 200, times: 7 };
function wholeError(v: string, min: number, max: number, label: string) {
  if (v.trim() === "") return null;
  if (!/^\d+$/.test(v.trim())) return `${label} must be a whole number.`;
  const n = parseInt(v, 10);
  if (n < min || n > max) return `${label} must be between ${min} and ${max}.`;
  return null;
}

/**
 * New route, or edit an existing one (`route` given). In edit mode the type is read-only and chapters
 * aren't offered (milestones are managed in the list). Remount (key) to reset the fields.
 */
export function RouteDialog({ open, onOpenChange, route }: { open: boolean; onOpenChange: (o: boolean) => void; route?: RouteRow }) {
  const qc = useQueryClient();
  const { data: existingRoutes } = useRoutes();
  const { data: onboarding } = useOnboarding();
  const navigate = useNavigate();
  const editing = !!route;
  const [name, setName] = useState(route?.name ?? "");
  const [type, setType] = useState<RouteType>(route?.type ?? "book");
  const [description, setDescription] = useState(route?.description ?? "");
  const [target, setTarget] = useState(route?.target_date ?? "");
  const [chapters, setChapters] = useState("");
  const [pages, setPages] = useState(route?.total_pages ? String(route.total_pages) : "");
  const [freq, setFreq] = useState(route?.habit_frequency ?? "daily");
  const [times, setTimes] = useState(route?.habit_target ? String(route.habit_target) : "3");
  const [lang, setLang] = useState(route?.speech_lang ?? "");
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const errors = {
    name: name.trim() ? null : "Give your route a name.",
    chapters: type === "book" && !editing ? wholeError(chapters, 1, LIMITS.chapters, "Chapters") : null,
    pages: type === "book" ? wholeError(pages, 1, LIMITS.pages, "Total pages") : null,
    times: type === "habit" && freq === "x_per_week" ? (times.trim() === "" ? "Enter times per week." : wholeError(times, 1, LIMITS.times, "Times per week")) : null,
    lang: type === "language" && lang.trim() && !SPEECH_LANG_RE.test(lang.trim()) ? "Use a language code like es-ES or ja-JP." : null,
  };
  const valid = !Object.values(errors).some(Boolean);
  const show = (k: keyof typeof errors) => (tried || k !== "name") && errors[k];
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["routes"] });
    void qc.invalidateQueries({ queryKey: ["route-stats"] });
  };

  const { submitting: submittingSave, submit: submitSave } = useSubmission();
  function save(e: React.FormEvent) { e.preventDefault(); return submitSave(() => saveRequest(e)); }
  async function saveRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!requireOnline("Saving a route")) return;
    setTried(true);
    if (!valid || busy) return;
    setBusy(true);
    const total = type === "book" && pages ? parseInt(pages, 10) : null;
    const common = {
      name: name.trim(),
      description: description.trim() || null,
      target_date: target || null,
      total_pages: total,
      habit_frequency: type === "habit" ? freq : null,
      habit_target: type === "habit" && freq === "x_per_week" ? parseInt(times, 10) : null,
      speech_lang: type === "language" && lang.trim() ? lang.trim() : null,
    };
    if (route) {
      const cur = route.current_page;
      const current_page = total == null ? cur : Math.min(cur ?? 0, total);
      const { error } = await supabase.from("routes").update({ ...common, current_page }).eq("id", route.id);
      setBusy(false);
      if (error) { toast.error(`Couldn't save the route: ${error.message}`); return; }
      if (cur != null && current_page !== cur) toast.success(`Route saved. Current page set to ${current_page}.`);
      else toast.success("Route saved.");
      invalidate();
      onOpenChange(false);
      return;
    }
    const { data: created, error } = await supabase
      .from("routes")
      .insert({ ...common, type, current_page: total ? 0 : null })
      .select()
      .single();
    if (error || !created) {
      setBusy(false);
      toast.error(error?.message ?? "Could not create route");
      return;
    }
    if (existingRoutes?.length === 0 && !onboarding?.onboarding_done_at && !onboarding?.onboarding_started_at) {
      try { await markOnboarding(qc, "start"); } catch (e) { toast.error(`Route created, but onboarding could not be saved: ${(e as Error).message}`); }
    }
    const n = parseInt(chapters, 10);
    if (type === "book" && n > 0) {
      const { error: msErr } = await supabase.from("milestones").insert(Array.from({ length: n }, (_, i) => ({ route_id: created.id, title: `Chapter ${i + 1}`, position: i })));
      if (msErr) toast.error(`Route created, but chapters couldn't be added: ${msErr.message}`);
    }
    setBusy(false);
    invalidate();
    void qc.invalidateQueries({ queryKey: ["milestones"] });
    onOpenChange(false);
    navigate({ to: "/routes/$id", params: { id: created.id } });
  }

  const err = (k: keyof typeof errors) => (show(k) ? <p className="text-xs text-destructive-strong">{errors[k]}</p> : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Edit route" : "New route"}</DialogTitle></DialogHeader>
        <form onSubmit={save} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rn">Name</Label>
            <Input id="rn" className="h-12" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Designing Data-Intensive Applications" aria-invalid={!!show("name")} />
            {err("name")}
          </div>
          <div className="space-y-2">
            <Label htmlFor="rt">Type</Label>
            {editing ? (
              <Input id="rt" readOnly value={`${TYPE_LABEL[type]} · can't be changed`} className="h-12 border-dashed text-muted-foreground" />
            ) : (
              <NativeSelect id="rt" value={type} onChange={(e) => setType(e.target.value as RouteType)}>
                {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </NativeSelect>
            )}
          </div>
          {type === "book" && (
            <div className="grid grid-cols-2 gap-3">
              {!editing && (
                <div className="space-y-2">
                  <Label htmlFor="rc">Chapters</Label>
                  <Input id="rc" inputMode="numeric" className="h-12" value={chapters} onChange={(e) => setChapters(e.target.value)} placeholder="Auto-create" aria-invalid={!!show("chapters")} />
                  {err("chapters")}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="rp">Total pages</Label>
                <Input id="rp" inputMode="numeric" className="h-12" value={pages} onChange={(e) => setPages(e.target.value)} aria-invalid={!!show("pages")} />
                {err("pages")}
              </div>
            </div>
          )}
          {type === "habit" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="rf">Frequency</Label>
                <NativeSelect id="rf" value={freq} onChange={(e) => setFreq(e.target.value)}>
                  <option value="daily">Daily</option>
                  <option value="x_per_week">X times / week</option>
                  <option value="weekly">Weekly</option>
                </NativeSelect>
              </div>
              {freq === "x_per_week" && (
                <div className="space-y-2">
                  <Label htmlFor="rx">Times per week</Label>
                  <Input id="rx" inputMode="numeric" className="h-12" value={times} onChange={(e) => setTimes(e.target.value)} aria-invalid={!!show("times")} />
                  {err("times")}
                </div>
              )}
            </div>
          )}
          {type === "language" && (
            <div className="space-y-2">
              <Label htmlFor="rl">Speech language (optional)</Label>
              <Input id="rl" list="speech-langs" className="h-12" value={lang} onChange={(e) => setLang(e.target.value)} placeholder="e.g. es-ES, fr-FR, ja-JP" aria-invalid={!!show("lang")} />
              <datalist id="speech-langs">{SPEECH_LANGS.map((l) => <option key={l} value={l} />)}</datalist>
              {err("lang")}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="rd">Description (optional)</Label>
            <Textarea id="rd" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rtd">Target date (optional)</Label>
            <Input id="rtd" type="date" className="h-12" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <Button type="submit" className="h-12 w-full" disabled={busy || submittingSave}>{editing ? "Save" : "Start climbing"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
