import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArchiveRestore, Plus, Trophy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isLive, STATUS_LABEL, TYPE_LABEL, useRefresh, useRouteStats, useRoutes, type RouteStatus, type RouteType } from "@/lib/data";
import { routeStats } from "@/lib/camp";
import { AltitudeBar, CampBadge } from "@/components/app/Mountain";
import { Empty, NativeSelect } from "@/components/app/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/routes/")({
  head: () => ({ meta: [{ title: "Routes — Ascent" }, { name: "description", content: "Everything you're mastering." }] }),
  component: RoutesPage,
});

const ORDER: RouteStatus[] = ["active", "paused", "summited", "abandoned"];

function RoutesPage() {
  const { data: routes } = useRoutes();
  const { data: stats } = useRouteStats();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [showArchived, setShowArchived] = useState(false);
  if (!routes || !stats) return <p className="text-muted-foreground">Loading…</p>;
  const live = routes.filter(isLive);
  const archived = routes.filter((r) => !isLive(r));

  async function restore(id: string) {
    const { error } = await supabase.from("routes").update({ archived_at: null, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(`Couldn't restore: ${error.message}`); return; }
    toast.success("Route restored.");
    refresh();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Routes</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="h-12">
            <Link to="/summits"><Trophy className="h-4 w-4 text-gold" /> Summits</Link>
          </Button>
          <Button className="h-12" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New route</Button>
        </div>
      </div>
      {live.length === 0 && <Empty>Every climb starts at base camp. Add a book, language, skill, course, paper or habit.</Empty>}
      {ORDER.map((status) => {
        const list = live.filter((r) => r.status === status);
        if (!list.length) return null;
        return (
          <section key={status}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{STATUS_LABEL[status]}</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {list.map((r) => {
                const s = routeStats(r, stats.get(r.id));
                return (
                  <li key={r.id}>
                    <Link to="/routes/$id" params={{ id: r.id }} className="surface block space-y-3 p-4 hover:border-primary/50">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{r.name}</p>
                          <p className="text-xs text-muted-foreground">{TYPE_LABEL[r.type]}</p>
                        </div>
                        <CampBadge camp={s.camp} />
                      </div>
                      <AltitudeBar camp={s.camp} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {archived.length > 0 && (
        <section>
          <Button variant="ghost" className="h-12 px-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground" onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived}>
            Archived ({archived.length}) {showArchived ? "▴" : "▾"}
          </Button>
          {showArchived && (
            <ul className="mt-2 space-y-2">
              {archived.map((r) => (
                <li key={r.id} className="surface flex items-center gap-3 p-3 pl-4">
                  <Link to="/routes/$id" params={{ id: r.id }} className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{TYPE_LABEL[r.type]}</p>
                  </Link>
                  <Button variant="outline" className="h-12" onClick={() => restore(r.id)}><ArchiveRestore className="h-4 w-4" /> Restore</Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <NewRouteDialog
        key={formKey}
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setTimeout(() => setFormKey((k) => k + 1), 200); // fresh form after the close animation
        }}
      />
    </div>
  );
}

const LIMITS = { pages: 20000, chapters: 200, times: 7 };
function wholeError(v: string, min: number, max: number, label: string) {
  if (v.trim() === "") return null;
  if (!/^\d+$/.test(v.trim())) return `${label} must be a whole number.`;
  const n = parseInt(v, 10);
  if (n < min || n > max) return `${label} must be between ${min} and ${max}.`;
  return null;
}

function NewRouteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const refresh = useRefresh();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [type, setType] = useState<RouteType>("book");
  const [description, setDescription] = useState("");
  const [target, setTarget] = useState("");
  const [chapters, setChapters] = useState("");
  const [pages, setPages] = useState("");
  const [freq, setFreq] = useState("daily");
  const [times, setTimes] = useState("3");
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const errors = {
    name: name.trim() ? null : "Give your route a name.",
    chapters: type === "book" ? wholeError(chapters, 1, LIMITS.chapters, "Chapters") : null,
    pages: type === "book" ? wholeError(pages, 1, LIMITS.pages, "Total pages") : null,
    times: type === "habit" && freq === "x_per_week" ? (times.trim() === "" ? "Enter times per week." : wholeError(times, 1, LIMITS.times, "Times per week")) : null,
  };
  const valid = !Object.values(errors).some(Boolean);
  const show = (k: keyof typeof errors) => (tried || (k !== "name")) && errors[k];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!valid || busy) return;
    setBusy(true);
    const { data: route, error } = await supabase
      .from("routes")
      .insert({
        name: name.trim(),
        type,
        description: description || null,
        target_date: target || null,
        total_pages: type === "book" && pages ? parseInt(pages, 10) : null,
        current_page: type === "book" && pages ? 0 : null,
        habit_frequency: type === "habit" ? freq : null,
        habit_target: type === "habit" && freq === "x_per_week" ? parseInt(times, 10) : null,
      })
      .select()
      .single();
    if (error || !route) {
      setBusy(false);
      toast.error(error?.message ?? "Could not create route");
      return;
    }
    const n = parseInt(chapters, 10);
    if (type === "book" && n > 0) {
      const { error: msErr } = await supabase.from("milestones").insert(Array.from({ length: n }, (_, i) => ({ route_id: route.id, title: `Chapter ${i + 1}`, position: i })));
      if (msErr) toast.error(`Route created, but chapters couldn't be added: ${msErr.message}`);
    }
    setBusy(false);
    refresh();
    onOpenChange(false);
    navigate({ to: "/routes/$id", params: { id: route.id } });
  }

  const err = (k: keyof typeof errors) => show(k) ? <p className="text-xs text-destructive">{errors[k]}</p> : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>New route</DialogTitle></DialogHeader>
        <form onSubmit={save} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rn">Name</Label>
            <Input id="rn" className="h-12" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Designing Data-Intensive Applications" aria-invalid={!!show("name")} />
            {err("name")}
          </div>
          <div className="space-y-2">
            <Label htmlFor="rt">Type</Label>
            <NativeSelect id="rt" value={type} onChange={(e) => setType(e.target.value as RouteType)}>
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </NativeSelect>
          </div>
          {type === "book" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="rc">Chapters</Label>
                <Input id="rc" inputMode="numeric" className="h-12" value={chapters} onChange={(e) => setChapters(e.target.value)} placeholder="Auto-create" aria-invalid={!!show("chapters")} />
                {err("chapters")}
              </div>
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
          <div className="space-y-2">
            <Label htmlFor="rd">Description (optional)</Label>
            <Textarea id="rd" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rtd">Target date (optional)</Label>
            <Input id="rtd" type="date" className="h-12" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <Button type="submit" className="h-12 w-full" disabled={busy}>Start climbing</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
