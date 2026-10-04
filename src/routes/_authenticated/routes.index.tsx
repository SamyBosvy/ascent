import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trophy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { STATUS_LABEL, TYPE_LABEL, useAll, useRefresh, type RouteStatus, type RouteType } from "@/lib/data";
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
  const { data } = useAll();
  const [open, setOpen] = useState(false);
  if (!data) return <p className="text-muted-foreground">Loading…</p>;
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
      {data.routes.length === 0 && <Empty>Every climb starts at base camp. Add a book, language, skill, course, paper or habit.</Empty>}
      {ORDER.map((status) => {
        const list = data.routes.filter((r) => r.status === status);
        if (!list.length) return null;
        return (
          <section key={status}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{STATUS_LABEL[status]}</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {list.map((r) => {
                const s = routeStats(r, data);
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
      <NewRouteDialog open={open} onOpenChange={setOpen} />
    </div>
  );
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

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data: route, error } = await supabase
      .from("routes")
      .insert({
        name: name.trim(),
        type,
        description: description || null,
        target_date: target || null,
        total_pages: type === "book" && pages ? parseInt(pages) : null,
        current_page: type === "book" && pages ? 0 : null,
        habit_frequency: type === "habit" ? freq : null,
        habit_target: type === "habit" && freq === "x_per_week" ? parseInt(times) || 3 : null,
      })
      .select()
      .single();
    if (error || !route) {
      setBusy(false);
      return toast.error(error?.message ?? "Could not create route");
    }
    const n = parseInt(chapters);
    if (type === "book" && n > 0) {
      await supabase.from("milestones").insert(Array.from({ length: Math.min(n, 200) }, (_, i) => ({ route_id: route.id, title: `Chapter ${i + 1}`, position: i })));
    }
    setBusy(false);
    refresh();
    onOpenChange(false);
    setName("");
    navigate({ to: "/routes/$id", params: { id: route.id } });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>New route</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rn">Name</Label>
            <Input id="rn" required className="h-12" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Designing Data-Intensive Applications" />
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
                <Input id="rc" type="number" min={0} className="h-12" value={chapters} onChange={(e) => setChapters(e.target.value)} placeholder="Auto-create" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rp">Total pages</Label>
                <Input id="rp" type="number" min={0} className="h-12" value={pages} onChange={(e) => setPages(e.target.value)} />
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
                  <Input id="rx" type="number" min={1} max={7} className="h-12" value={times} onChange={(e) => setTimes(e.target.value)} />
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
