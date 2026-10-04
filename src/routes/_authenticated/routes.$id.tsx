import type { Database } from "@/integrations/supabase/types";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Check, Info, Minus, Pause, Play, Plus, RotateCcw, Square, Trash2, Upload } from "lucide-react";
import { format } from "date-fns";
import Papa from "papaparse";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchPaged, minutesLabel, must, STATUS_LABEL, TYPE_LABEL, useRefresh, useRouteStats, useRoutes, type Milestone, type RouteStatus, type Session } from "@/lib/data";
import { clockLabel, elapsedMs, timer, useTimer } from "@/lib/timer";
import { CAMPS, habitConsistency, habitDueToday, routeStats } from "@/lib/camp";
import { Mountain } from "@/components/app/Mountain";
import { toggleCheckin } from "@/lib/checkins";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SummitOverlay } from "@/components/app/SummitOverlay";
import { CardDialog } from "@/components/app/CardDialog";
import { Empty, NativeSelect, SectionTitle } from "@/components/app/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/routes/$id")({
  head: () => ({ meta: [{ title: "Route — Ascent" }, { name: "description", content: "Progress, milestones, sessions and cards." }] }),
  component: RouteDetail,
});

function RouteDetail() {
  const { id } = Route.useParams();
  const { data: routes } = useRoutes();
  const { data: allStats } = useRouteStats();
  const { data: milestoneRows } = useQuery({
    queryKey: ["milestones", id],
    queryFn: () => fetchPaged<Milestone>((a, b) => supabase.from("milestones").select("*").eq("route_id", id).order("position").order("id").range(a, b)),
  });
  const { data: sessions } = useQuery({
    queryKey: ["sessions", id, "recent"],
    queryFn: () => must<Session[]>(supabase.from("sessions").select("*").eq("route_id", id).order("logged_at", { ascending: false }).limit(8)),
  });
  const refresh = useRefresh();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [celebrate, setCelebrate] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [newMs, setNewMs] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const dismissKey = `ascent:summit-dismissed:${id}`;
  const [, setDismissTick] = useState(0);
  const dismissed = typeof sessionStorage !== "undefined" && sessionStorage.getItem(dismissKey) === "1";

  const route = routes?.find((r) => r.id === id);
  const agg = allStats?.get(id);
  const stats = route && allStats ? routeStats(route, agg) : null;

  if (!routes || !allStats || !milestoneRows || !sessions) return <p className="text-muted-foreground">Loading…</p>;
  if (!route || !stats) return <Empty>This route doesn't exist.</Empty>;

  const milestones = [...milestoneRows].sort((a, b) => a.position - b.position);
  const due = stats.due;
  // Reaching the summit never writes anything by itself; the user confirms.
  const offerSummit = stats.camp === 4 && route.status !== "summited" && !dismissed;

  async function markSummited() {
    const { error } = await supabase.from("routes").update({ status: "summited", summited_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setCelebrate(true);
    refresh();
  }
  function notYet() {
    sessionStorage.setItem(dismissKey, "1");
    setDismissTick((t) => t + 1);
  }

  async function update(patch: Database["public"]["Tables"]["routes"]["Update"]) {
    const { error } = await supabase.from("routes").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message);
    refresh();
    return !error;
  }

  const msKey = ["milestones", id];
  const setMs = (fn: (rows: Milestone[]) => Milestone[]) => qc.setQueryData<Milestone[]>(msKey, (old) => fn(old ?? []));
  const msRefresh = () => {
    void qc.invalidateQueries({ queryKey: msKey });
    void qc.invalidateQueries({ queryKey: ["route-stats"] });
  };

  async function toggleMs(m: Milestone, done: boolean) {
    const done_at = done ? new Date().toISOString() : null;
    setMs((rows) => rows.map((r) => (r.id === m.id ? { ...r, done, done_at } : r)));
    const { error } = await supabase.from("milestones").update({ done, done_at }).eq("id", m.id);
    if (error) {
      setMs((rows) => rows.map((r) => (r.id === m.id ? m : r)));
      toast.error(`Couldn't update the milestone: ${error.message}`);
    }
    msRefresh();
  }
  async function addMs(e: React.FormEvent) {
    e.preventDefault();
    const title = newMs.trim();
    if (!title) return;
    const { error } = await supabase.from("milestones").insert({ route_id: id, title, position: (milestones.at(-1)?.position ?? -1) + 1 });
    if (error) { toast.error(`Couldn't add the milestone: ${error.message}`); return; }
    setNewMs("");
    msRefresh();
  }
  async function moveMs(i: number, dir: -1 | 1) {
    const a = milestones[i];
    const b = milestones[i + dir];
    if (!a || !b) return;
    const before = milestoneRows;
    setMs((rows) => rows.map((r) => (r.id === a.id ? { ...r, position: b.position } : r.id === b.id ? { ...r, position: a.position } : r)));
    const { error } = await supabase.rpc("swap_milestones", { _a: a.id, _b: b.id });
    if (error) {
      qc.setQueryData(msKey, before);
      toast.error(`Couldn't reorder: ${error.message}`);
    }
    msRefresh();
  }
  async function delMs(m: Milestone) {
    setMs((rows) => rows.filter((r) => r.id !== m.id));
    const { error } = await supabase.from("milestones").delete().eq("id", m.id);
    if (error) {
      setMs((rows) => [...rows, m]);
      toast.error(`Couldn't delete the milestone: ${error.message}`);
      msRefresh();
      return;
    }
    msRefresh();
    toast(`Deleted "${m.title}"`, {
      duration: 8000,
      action: {
        label: "Undo",
        onClick: async () => {
          const { error: e } = await supabase.from("milestones").insert({
            id: m.id, route_id: m.route_id, title: m.title, done: m.done, done_at: m.done_at, position: m.position, created_at: m.created_at,
          });
          if (e) toast.error(`Couldn't restore the milestone: ${e.message}`);
          msRefresh();
        },
      },
    });
  }

  async function setArchived(archived: boolean) {
    const { error } = await supabase.from("routes").update({ archived_at: archived ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(archived ? "Route archived. Find it under Archived on Routes." : "Route restored.");
    refresh();
  }

  async function deleteRoute() {
    // Soft delete now; the row (and everything under it) is hard-deleted after the undo window.
    const { error } = await supabase.from("routes").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(`Couldn't delete the route: ${error.message}`); return; }
    const name = route!.name;
    let undone = false;
    const purge = () => { if (!undone) void supabase.rpc("purge_deleted_routes", { _older_than_seconds: 9 }); };
    toast(`Deleted "${name}"`, {
      duration: 10000,
      onAutoClose: purge,
      onDismiss: purge,
      action: {
        label: "Undo",
        onClick: async () => {
          undone = true;
          const { error: e } = await supabase.from("routes").update({ deleted_at: null }).eq("id", id);
          if (e) toast.error(`Couldn't restore the route: ${e.message}`);
          else toast.success(`"${name}" restored.`);
          refresh();
        },
      },
    });
    refresh();
    navigate({ to: "/routes" });
  }

  function importCsv(file: File) {
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: async (res) => {
        let rows = res.data.filter((r) => r[0]?.trim() && r[1]?.trim());
        if (rows[0] && rows[0][0]?.toLowerCase() === "front" && rows[0][1]?.toLowerCase() === "back") rows = rows.slice(1);
        if (!rows.length) { toast.error("No front,back rows found."); return; }
        const { error } = await supabase.from("cards").insert(rows.map((r) => ({ route_id: id, front: r[0]!.trim(), back: r[1]!.trim() })));
        if (error) { toast.error(error.message); return; }
        toast.success(`Imported ${rows.length} cards.`);
        refresh();
      },
    });
  }

  return (
    <div className="space-y-10">
      {celebrate && <SummitOverlay name={route.name} onDone={() => setCelebrate(false)} />}
      {offerSummit && (
        <div className="surface flex flex-col gap-3 border-gold/60 p-5 sm:flex-row sm:items-center" role="status">
          <div className="h-1 w-10 shrink-0 rounded-full bg-gold sm:h-10 sm:w-1" />
          <p className="flex-1 font-medium">You've reached the summit. Mark this route as summited?</p>
          <div className="flex gap-2">
            <Button className="h-12" onClick={markSummited}>Mark as summited</Button>
            <Button variant="outline" className="h-12" onClick={notYet}>Not yet</Button>
          </div>
        </div>
      )}
      {route.archived_at && (
        <div className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center" role="status">
          <p className="flex-1 text-sm">This route is archived. It's hidden from Today, Routes and Review, and all its data is kept.</p>
          <Button variant="outline" className="h-12" onClick={() => setArchived(false)}><ArchiveRestore className="h-4 w-4" /> Restore</Button>
        </div>
      )}
      <div>
        <Link to="/routes" className="text-sm text-muted-foreground">← Routes</Link>
        <h1 className="mt-2 text-3xl font-semibold">{route.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {TYPE_LABEL[route.type]}
          {route.target_date && ` · target ${format(new Date(route.target_date), "MMM d, yyyy")}`}
        </p>
        {route.description && <p className="mt-3 max-w-prose text-muted-foreground">{route.description}</p>}
      </div>

      <div className="grid gap-6 md:grid-cols-[auto_1fr]">
        <div className="surface relative p-5">
          <Mountain camp={stats.camp} />
          <CampsInfo />
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Time" value={minutesLabel(stats.minutes)} />
            <Stat label="Milestones" value={stats.total ? `${stats.done}/${stats.total}` : "—"} />
            <Stat label="Retention" value={stats.retention == null ? "—" : `${Math.round(stats.retention * 100)}%`} />
          </div>
          <div className="surface grid gap-3 p-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Status</span>
              <NativeSelect value={route.status} onChange={(e) => {
                const status = e.target.value as RouteStatus;
                if (status === "summited") { void markSummited(); return; }
                update({ status, summited_at: null });
              }}>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </NativeSelect>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Camp</span>
              <NativeSelect value={route.camp_override ?? "auto"} onChange={(e) => update({ camp_override: e.target.value === "auto" ? null : parseInt(e.target.value) })}>
                <option value="auto">Automatic ({CAMPS[stats.calculated]})</option>
                {CAMPS.map((c, i) => <option key={c} value={i}>{c}</option>)}
              </NativeSelect>
            </label>
          </div>
          {route.type === "book" && route.total_pages ? (
            <BookPages current={route.current_page ?? 0} total={route.total_pages} onSave={(p) => update({ current_page: p })} />
          ) : null}
          {route.type === "habit" && (
            <div className="surface flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">{Math.round(habitConsistency(route, agg) * 100)}% consistency</p>
                <p className="text-xs text-muted-foreground">Last 30 days · {route.habit_frequency === "x_per_week" ? `${route.habit_target}× per week` : route.habit_frequency}</p>
              </div>
              {agg?.checked_today ? (
                <Button variant="ghost" className="h-12 text-primary" onClick={() => toggleCheckin(id, true, refresh)} aria-label="Checked in today. Tap to undo.">
                  <Check className="h-4 w-4" /> Checked in today
                </Button>
              ) : habitDueToday(route, agg) ? (
                <Button className="h-12" onClick={() => toggleCheckin(id, false, refresh)}>
                  <Check className="h-4 w-4" /> Check in
                </Button>
              ) : (
                <span className="text-sm text-primary">Done for now</span>
              )}
            </div>
          )}
        </div>
      </div>

      <section>
        <SectionTitle>{route.type === "habit" ? "Steps" : "Milestones"}</SectionTitle>
        <ul className="space-y-2">
          {milestones.map((m, i) => (
            <li key={m.id} className="surface flex items-center gap-1 p-1 pl-2">
              <button onClick={() => toggleMs(m, !m.done)} className="tap flex flex-1 items-center gap-3 text-left" aria-pressed={m.done}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${m.done ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>
                  {m.done && <Check className="h-4 w-4" />}
                </span>
                <span className={m.done ? "text-muted-foreground line-through" : ""}>{m.title}</span>
              </button>
              <button className="tap flex items-center justify-center text-muted-foreground disabled:opacity-30" disabled={i === 0} onClick={() => moveMs(i, -1)} aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>
              <button className="tap flex items-center justify-center text-muted-foreground disabled:opacity-30" disabled={i === milestones.length - 1} onClick={() => moveMs(i, 1)} aria-label="Move down"><ArrowDown className="h-4 w-4" /></button>
              <button className="tap flex items-center justify-center text-muted-foreground" onClick={() => delMs(m)} aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
        <form onSubmit={addMs} className="mt-3 flex gap-2">
          <Input className="h-12" placeholder="Add a milestone" value={newMs} onChange={(e) => setNewMs(e.target.value)} />
          <Button type="submit" variant="outline" className="h-12 w-12" aria-label="Add"><Plus className="h-4 w-4" /></Button>
        </form>
      </section>

      <SessionsSection routeId={id} routeName={route.name} />
      <section>
        <ul className="space-y-1 text-sm">
          {sessions.slice(0, 8).map((s) => (
            <li key={s.id} className="flex justify-between gap-3 border-b py-2 last:border-0">
              <span className="truncate text-muted-foreground">{format(new Date(s.logged_at), "EEE MMM d")}{s.note && ` · ${s.note}`}</span>
              <span className="shrink-0 font-medium">{minutesLabel(s.minutes)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <SectionTitle
          action={
            <Button asChild variant="outline" className="h-12">
              <Link to="/notes" search={{ route: id }}>Notes</Link>
            </Button>
          }
        >
          Flashcards
        </SectionTitle>
        <div className="surface flex flex-wrap items-center gap-2 p-4">
          <p className="mr-auto text-sm">{stats.cards} cards · {due} due</p>
          <Button variant="outline" className="h-12" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Import CSV</Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
          <Button variant="outline" className="h-12" onClick={() => setCardOpen(true)}><Plus className="h-4 w-4" /> Card</Button>
          {due && !route.archived_at ? (
            <Button asChild className="h-12">
              <Link to="/review" search={{ route: id }}>Review</Link>
            </Button>
          ) : (
            <Button className="h-12" disabled>Review</Button>
          )}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
      {route.archived_at ? (
        <Button variant="outline" className="h-12" onClick={() => setArchived(false)}><ArchiveRestore className="h-4 w-4" /> Restore route</Button>
      ) : (
        <Button variant="outline" className="h-12" onClick={() => setArchived(true)}><Archive className="h-4 w-4" /> Archive route</Button>
      )}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" className="h-12 text-destructive">Delete route</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this route?</AlertDialogTitle>
            <AlertDialogDescription>Milestones, sessions, notes and flashcards for "{route.name}" will be deleted. You'll have 10 seconds to undo. To keep them, archive the route instead.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void deleteRoute()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>

      <CardDialog open={cardOpen} onOpenChange={setCardOpen} routeId={id} />
    </div>
  );
}

function CampsInfo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="absolute right-2 top-2 h-12 w-12" aria-label="How camps work"><Info className="h-4 w-4" /></Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-2 text-sm">
        <p className="font-display font-semibold">How camps work</p>
        <p className="text-muted-foreground">Your camp comes from a score made of:</p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li><span className="text-foreground">Progress, 50%</span> — milestones done, or pages read. For habits: consistency.</li>
          <li><span className="text-foreground">Time, 20%</span> — time logged, full marks at 20 hours.</li>
          <li><span className="text-foreground">Flashcards, 30%</span> — half mature cards, half recent recall.</li>
        </ul>
        <p className="text-muted-foreground">Parts you don't use are left out. Camp 1 at 15%, Camp 2 at 40%, Camp 3 at 65%, Summit at 90%.</p>
        <p className="text-muted-foreground">You can always set the camp by hand with the Camp menu.</p>
      </PopoverContent>
    </Popover>
  );
}

function BookPages({ current, total, onSave }: { current: number; total: number; onSave: (p: number) => Promise<boolean> }) {
  const [value, setValue] = useState(String(current));
  useEffect(() => setValue(String(current)), [current]);
  const clamp = (n: number) => Math.max(0, Math.min(total, Math.round(n)));
  function commit(n: number) {
    const next = clamp(Number.isFinite(n) ? n : current);
    setValue(String(next));
    if (next !== current) void onSave(next).then((ok) => { if (!ok) setValue(String(current)); });
  }
  const shown = clamp(parseInt(value, 10) || 0);
  return (
    <div className="surface space-y-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Page</span>
        <Button variant="outline" className="h-12 w-12" aria-label="Previous page" disabled={current <= 0} onClick={() => commit(current - 1)}><Minus className="h-4 w-4" /></Button>
        <Input
          type="number"
          inputMode="numeric"
          className="h-12 w-24 text-center"
          value={value}
          min={0}
          max={total}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(parseInt(value, 10)); } }}
          onBlur={() => commit(parseInt(value, 10))}
        />
        <Button variant="outline" className="h-12 w-12" aria-label="Next page" disabled={current >= total} onClick={() => commit(current + 1)}><Plus className="h-4 w-4" /></Button>
        <Button variant="outline" className="h-12" disabled={current >= total} onClick={() => commit(current + 10)}>+10</Button>
      </div>
      <p className="text-sm text-muted-foreground">Page {shown} of {total} · {Math.round((shown / total) * 100)}%</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold">{value}</p>
    </div>
  );
}

function SessionsSection({ routeId, routeName }: { routeId: string; routeName: string }) {
  const refresh = useRefresh();
  const { state, elapsed } = useTimer();
  const mine = state?.routeId === routeId ? state : null;
  const shown = mine ? elapsed : 0;
  const running = !!mine && !mine.paused;
  const other = state && state.routeId !== routeId ? state : null;
  const [manual, setManual] = useState("");
  const [note, setNote] = useState("");
  const [confirmSwitch, setConfirmSwitch] = useState(false);

  async function save(minutes: number, forRoute = routeId) {
    if (minutes < 1) { toast.error("Log at least one minute."); return false; }
    const { error } = await supabase.from("sessions").insert({ route_id: forRoute, minutes, note: note.trim() || null });
    if (error) { toast.error(error.message); return false; }
    toast.success(`${minutesLabel(minutes)} logged. Keep climbing.`);
    setNote("");
    setManual("");
    refresh();
    return true;
  }

  function start() {
    if (other) { setConfirmSwitch(true); return; }
    if (mine) timer.resume();
    else timer.start(routeId, routeName);
  }

  async function stopOtherAndStart() {
    const s = timer.get();
    if (s) {
      const ok = await save(Math.max(1, Math.round(elapsed / 60000)), s.routeId);
      if (!ok) return;
    }
    timer.start(routeId, routeName);
    setConfirmSwitch(false);
  }

  return (
    <section>
      <SectionTitle>Log a session</SectionTitle>
      <div className="surface space-y-4 p-4">
        <div className="flex items-center gap-3">
          <p className="mr-auto font-display text-4xl font-semibold tabular-nums">{clockLabel(shown)}</p>
          {running ? (
            <Button variant="outline" className="h-12 w-12" aria-label="Pause" onClick={() => timer.pause()}><Pause className="h-5 w-5" /></Button>
          ) : (
            <Button className="h-12 w-12" aria-label={mine ? "Resume" : "Start"} onClick={start}><Play className="h-5 w-5" /></Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="h-12 w-12" aria-label="Reset timer" disabled={!mine}><RotateCcw className="h-5 w-5" /></Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset the timer?</AlertDialogTitle>
                <AlertDialogDescription>The {clockLabel(shown)} on the clock won't be logged.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => timer.clear()}>Reset</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button
            variant="outline"
            className="h-12 w-12"
            aria-label="Stop and save"
            disabled={!mine || shown < 1000}
            onClick={async () => {
              timer.pause();
              const ok = await save(Math.max(1, Math.round(elapsedMs(timer.get()) / 60000)));
              if (ok) timer.clear();
            }}
          >
            <Square className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex gap-2">
          <Input className="h-12 w-28" type="number" inputMode="numeric" min={1} placeholder="Minutes" value={manual} onChange={(e) => setManual(e.target.value)} />
          <Input className="h-12" placeholder="One-line note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button variant="outline" className="h-12" disabled={!manual} onClick={() => save(parseInt(manual) || 0)}>Log</Button>
        </div>
      </div>
      <AlertDialog open={confirmSwitch} onOpenChange={setConfirmSwitch}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>A session is already running</AlertDialogTitle>
            <AlertDialogDescription>
              {other?.routeName} has {clockLabel(elapsed)} on the clock. Stop and save it, then start timing {routeName}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it running</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void stopOtherAndStart(); }}>Stop and start here</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
