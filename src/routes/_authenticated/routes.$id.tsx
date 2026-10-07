import { useSubmission } from "@/hooks/use-submission";
import { ScreenSkeleton } from "@/components/app/ScreenSkeleton";
import type { Database } from "@/integrations/supabase/types";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Check, Info, Minus, MoreHorizontal, Pause, Pencil, Play, Plus, RotateCcw, Square, Trash2, Upload } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchPaged, localDate, minutesLabel, useCheckinHistory, must, STATUS_LABEL, TYPE_LABEL, useRefresh, useRouteStats, useRoutes, type Milestone, type RouteStatus, type Session } from "@/lib/data";
import { RouteDialog } from "@/components/app/RouteDialog";
import { CsvImportDialog } from "@/components/app/CsvImportDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { clockLabel, elapsedMs, timer, useTimer } from "@/lib/timer";
import { CAMPS, habitConsistency, habitDueToday, routeStats } from "@/lib/camp";
import { Mountain } from "@/components/app/Mountain";
import { toggleCheckin } from "@/lib/checkins";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SummitOverlay } from "@/components/app/SummitOverlay";
import { PacingLine } from "@/components/app/Pacing";
import { HabitHeatmap, StreakLine } from "@/components/app/Habit";
import { z } from "zod";
import { CardDialog } from "@/components/app/CardDialog";
import { Empty, NativeSelect, SectionTitle } from "@/components/app/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/routes/$id")({
  validateSearch: z.object({ focus: z.enum(["page"]).optional() }),
  head: () => ({ meta: [{ property: "og:title", content: "Route — Ascent" }, { property: "og:description", content: "Progress, milestones, sessions and cards." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { title: "Route — Ascent" }, { name: "description", content: "Progress, milestones, sessions and cards." }] }),
  component: RouteDetail,
});

function RouteDetail() {
  const { id } = Route.useParams();
  const { focus } = Route.useSearch();
  const { data: routes } = useRoutes();
  const { data: allStats } = useRouteStats();
  const { data: milestoneRows } = useQuery({
    queryKey: ["milestones", id],
    queryFn: () => fetchPaged<Milestone>((a, b) => supabase.from("milestones").select("*").eq("route_id", id).order("position").order("id").range(a, b)),
  });
  const refresh = useRefresh();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [celebrate, setCelebrate] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [newMs, setNewMs] = useState("");
  const { submitting: submittingMilestone, submit: submitMilestone } = useSubmission();
  const [importOpen, setImportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editKey, setEditKey] = useState(0);
  const dismissKey = `ascent:summit-dismissed:${id}`;
  const [, setDismissTick] = useState(0);
  const dismissed = typeof sessionStorage !== "undefined" && sessionStorage.getItem(dismissKey) === "1";

  const route = routes?.find((r) => r.id === id);
  const agg = allStats?.get(id);
  const { data: history } = useCheckinHistory(route?.type === "habit" ? id : "none");
  // "Continue" on Today opens a book at its page input.
  const pageReady = !!route && !!allStats;
  useEffect(() => {
    if (focus !== "page" || !pageReady) return;
    const el = document.getElementById("book-current-page") as HTMLInputElement | null;
    el?.focus();
    el?.scrollIntoView({ block: "center" });
  }, [focus, pageReady]);
  const stats = route && allStats ? routeStats(route, agg) : null;

  if (!routes || !allStats || !milestoneRows) return <ScreenSkeleton screen="route" />;
  if (!route || !stats) return <Empty>This route doesn't exist.</Empty>;

  const milestones = [...milestoneRows].sort((a, b) => a.position - b.position);
  const due = stats.due;
  // Reaching the summit never writes anything by itself; the user confirms.
  const offerSummit = stats.camp === 4 && route.status !== "summited" && !dismissed;

  async function markSummited() {
    const { error } = await supabase.from("routes").update({ status: "summited", summited_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setCelebrate(true);
    refresh();
  }
  function notYet() {
    sessionStorage.setItem(dismissKey, "1");
    setDismissTick((t) => t + 1);
  }

  async function update(patch: Database["public"]["Tables"]["routes"]["Update"]) {
    const { error } = await supabase.from("routes").update({ ...patch }).eq("id", id);
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
  function addMs(e: React.FormEvent) { e.preventDefault(); return submitMilestone(() => addMsRequest(e)); }
  async function addMsRequest(e: React.FormEvent) {
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
    const { error } = await supabase.from("routes").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", id);
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
        <div className="mt-2 flex items-start justify-between gap-3">
          <h1 className="text-3xl font-semibold">{route.name}</h1>
          <Button variant="outline" className="h-12 shrink-0" onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" /> Edit route</Button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {TYPE_LABEL[route.type]}
          {route.target_date && ` · target ${format(new Date(`${route.target_date}T12:00:00`), "MMM d, yyyy")}`}
        </p>
        <PacingLine route={route} agg={agg} className="mt-1 text-sm" />
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
            <label htmlFor="route-status" className="space-y-1 text-sm">
              <span className="text-muted-foreground">Status</span>
              <NativeSelect id="route-status" value={route.status} onChange={(e) => {
                const status = e.target.value as RouteStatus;
                if (status === "summited") { void markSummited(); return; }
                update({ status, summited_at: null });
              }}>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </NativeSelect>
            </label>
            <label htmlFor="route-camp" className="space-y-1 text-sm">
              <span className="text-muted-foreground">Camp</span>
              <NativeSelect id="route-camp" value={route.camp_override ?? "auto"} onChange={(e) => update({ camp_override: e.target.value === "auto" ? null : parseInt(e.target.value) })}>
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
                <StreakLine route={route} dates={history?.get(id)} today={localDate()} className="mt-1" />
              </div>
              {agg?.checked_today ? (
                <Button variant="ghost" className="h-12 text-primary-strong" onClick={() => toggleCheckin(id, true, refresh)} aria-label="Checked in today. Tap to undo.">
                  <Check className="h-4 w-4" /> Checked in today
                </Button>
              ) : habitDueToday(route, agg) ? (
                <Button className="h-12" onClick={() => toggleCheckin(id, false, refresh)}>
                  <Check className="h-4 w-4" /> Check in
                </Button>
              ) : (
                <span className="text-sm text-primary-strong">Done for now</span>
              )}
            </div>
          )}
        </div>
      </div>

      {route.type === "habit" && (
        <section>
          <SectionTitle>Check-ins</SectionTitle>
          <HabitHeatmap dates={history?.get(id)} today={localDate()} />
        </section>
      )}

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
          <Input aria-label="New milestone" className="h-12" placeholder="Add a milestone" value={newMs} onChange={(e) => setNewMs(e.target.value)} />
          <Button disabled={submittingMilestone} type="submit" variant="outline" className="h-12 w-12" aria-label="Add"><Plus className="h-4 w-4" /></Button>
        </form>
      </section>

      <SessionsSection routeId={id} routeName={route.name} totalMinutes={stats.minutes} />

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
          <Button variant="outline" className="h-12" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" /> Import CSV</Button>
          <Button asChild variant="outline" className="h-12">
            <Link to="/cards" search={{ route: id }}>Browse cards</Link>
          </Button>
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
          <Button variant="ghost" className="h-12 text-destructive-strong">Delete route</Button>
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
      <CsvImportDialog open={importOpen} onOpenChange={setImportOpen} routeId={id} />
      <RouteDialog
        key={`${editKey}-${route.updated_at}`}
        route={route}
        open={editOpen}
        onOpenChange={(o) => { setEditOpen(o); if (!o) setTimeout(() => setEditKey((k) => k + 1), 200); }}
      />
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
        <Label htmlFor="book-current-page" className="text-sm text-muted-foreground">Page</Label>
        <Button variant="outline" className="h-12 w-12" aria-label="Previous page" disabled={current <= 0} onClick={() => commit(current - 1)}><Minus className="h-4 w-4" /></Button>
        <Input
          id="book-current-page"
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

const MAX_MIN = 1440;
const minutesError = (v: string) => {
  if (!/^\d+$/.test(v.trim())) return "Minutes must be a whole number.";
  const n = parseInt(v, 10);
  return n < 1 || n > MAX_MIN ? `Minutes must be between 1 and ${MAX_MIN}.` : null;
};
/** Today keeps the current time of day; past dates are saved at noon local time. */
function loggedAtFor(day: string) {
  if (!day || day === localDate()) return new Date().toISOString();
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 12, 0, 0).toISOString();
}
const toLocalInput = (iso: string) => format(new Date(iso), "yyyy-MM-dd'T'HH:mm");
const SESSION_PAGE = 50;

function SessionsSection({ routeId, routeName, totalMinutes }: { routeId: string; routeName: string; totalMinutes: number }) {
  const qc = useQueryClient();
  const { state, elapsed } = useTimer();
  const mine = state?.routeId === routeId ? state : null;
  const shown = mine ? elapsed : 0;
  const running = !!mine && !mine.paused;
  const other = state && state.routeId !== routeId ? state : null;
  const [manual, setManual] = useState("");
  const [note, setNote] = useState("");
  const [day, setDay] = useState(localDate());
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const [limit, setLimit] = useState(8);
  const [editing, setEditing] = useState<Session | null>(null);

  const { data: list } = useQuery({
    queryKey: ["sessions", routeId, "list", limit],
    queryFn: () => must<Session[]>(supabase.from("sessions").select("*").eq("route_id", routeId).order("logged_at", { ascending: false }).order("id").limit(limit + 1)),
    placeholderData: (prev) => prev,
  });
  const rows = list?.slice(0, limit) ?? [];
  const more = (list?.length ?? 0) > limit;

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["sessions"] });
    void qc.invalidateQueries({ queryKey: ["route-stats"] });
    void qc.invalidateQueries({ queryKey: ["insights"] });
  };

  const { submitting: submittingSession, submit: submitSession } = useSubmission();
  function save(minutes: number, forRoute = routeId, loggedAt?: string) { return submitSession(() => saveRequest(minutes, forRoute, loggedAt)); }
  async function saveRequest(minutes: number, forRoute = routeId, loggedAt?: string) {
    if (minutes < 1 || minutes > MAX_MIN) { toast.error(`Log between 1 and ${MAX_MIN} minutes.`); return false; }
    const { error } = await supabase.from("sessions").insert({ route_id: forRoute, minutes, note: note.trim() || null, ...(loggedAt ? { logged_at: loggedAt } : {}) });
    if (error) { toast.error(error.message); return false; }
    toast.success(`${minutesLabel(minutes)} logged. Keep climbing.`);
    setNote("");
    setManual("");
    setDay(localDate());
    invalidate();
    return true;
  }

  async function del(s: Session) {
    const { error } = await supabase.from("sessions").delete().eq("id", s.id);
    if (error) { toast.error(`Couldn't delete the session: ${error.message}`); return; }
    invalidate();
    toast(`Deleted ${minutesLabel(s.minutes)} session`, {
      duration: 8000,
      action: {
        label: "Undo",
        onClick: async () => {
          const { error: e } = await supabase.from("sessions").insert({ id: s.id, route_id: s.route_id, minutes: s.minutes, note: s.note, logged_at: s.logged_at });
          if (e) toast.error(`Couldn't restore the session: ${e.message}`);
          invalidate();
        },
      },
    });
  }

  function start() {
    if (other) { setConfirmSwitch(true); return; }
    if (mine) timer.resume();
    else timer.start(routeId, routeName);
  }

  async function stopOtherAndStart() {
    const s = timer.get();
    if (s) {
      const ok = await save(Math.min(MAX_MIN, Math.max(1, Math.round(elapsed / 60000))), s.routeId);
      if (!ok) return;
    }
    timer.start(routeId, routeName);
    setConfirmSwitch(false);
  }

  const manualErr = manual.trim() ? minutesError(manual) : null;

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
            disabled={submittingSession || !mine || shown < 1000}
            onClick={async () => {
              timer.pause();
              const ok = await save(Math.min(MAX_MIN, Math.max(1, Math.round(elapsedMs(timer.get()) / 60000))));
              if (ok) timer.clear();
            }}
          >
            <Square className="h-5 w-5" />
          </Button>
        </div>
        <form
          className="space-y-2"
          onSubmit={(e) => { e.preventDefault(); if (manual && !manualErr) void save(parseInt(manual, 10), routeId, loggedAtFor(day)); }}
        >
          <div className="flex flex-wrap gap-2">
            <Input className="h-12 w-28" type="number" inputMode="numeric" min={1} max={MAX_MIN} placeholder="Minutes" aria-label="Minutes" value={manual} onChange={(e) => setManual(e.target.value)} aria-invalid={!!manualErr} />
            <Input className="h-12 w-40" type="date" aria-label="Date" value={day} max={localDate()} onChange={(e) => setDay(e.target.value && e.target.value > localDate() ? localDate() : e.target.value)} />
            <Input aria-label="Session note (optional)" className="h-12 min-w-40 flex-1" placeholder="One-line note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button type="submit" variant="outline" className="h-12" disabled={submittingSession || !manual || !!manualErr}>Log</Button>
          </div>
          {manualErr && <p className="text-xs text-destructive-strong">{manualErr}</p>}
        </form>
      </div>

      <div className="mt-4">
        <p className="mb-1 text-sm text-muted-foreground">Total on this route: <span className="font-medium text-foreground">{minutesLabel(totalMinutes)}</span></p>
        {list && rows.length === 0 && <p className="py-2 text-sm text-muted-foreground">No sessions logged yet.</p>}
        <ul className="space-y-1 text-sm">
          {rows.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 border-b py-1 last:border-0">
              <span className="truncate text-muted-foreground">{format(new Date(s.logged_at), "EEE MMM d, HH:mm")}{s.note && ` · ${s.note}`}</span>
              <span className="flex shrink-0 items-center gap-1">
                <span className="font-medium">{minutesLabel(s.minutes)}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-12 w-12" aria-label="Session actions"><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem className="min-h-12" onSelect={() => setEditing(s)}>Edit</DropdownMenuItem>
                    <DropdownMenuItem className="min-h-12 text-destructive-strong" onSelect={() => void del(s)}>Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </span>
            </li>
          ))}
        </ul>
        {more && (
          <Button variant="ghost" className="mt-2 h-12" onClick={() => setLimit((l) => (l === 8 ? SESSION_PAGE : l + SESSION_PAGE))}>
            {limit === 8 ? "Show all" : "Load more"}
          </Button>
        )}
      </div>

      <EditSessionDialog session={editing} onClose={() => setEditing(null)} onSaved={invalidate} />
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
            <AlertDialogAction disabled={submittingSession} onClick={(e) => { e.preventDefault(); void stopOtherAndStart(); }}>Stop and start here</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function EditSessionDialog({ session, onClose, onSaved }: { session: Session | null; onClose: () => void; onSaved: () => void }) {
  const [minutes, setMinutes] = useState("");
  const [note, setNote] = useState("");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (session) { setMinutes(String(session.minutes)); setNote(session.note ?? ""); setWhen(toLocalInput(session.logged_at)); }
  }, [session]);
  const maxWhen = toLocalInput(new Date().toISOString());
  const errs = {
    minutes: minutesError(minutes),
    when: !when ? "Pick a date and time." : new Date(when).getTime() > Date.now() + 60000 ? "Sessions can't be in the future." : null,
  };
  const { submitting: submittingEditSession, submit: submitEditSession } = useSubmission();
  function save(e: React.FormEvent) { e.preventDefault(); return submitEditSession(() => saveRequest(e)); }
  async function saveRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!session || errs.minutes || errs.when || busy) return;
    setBusy(true);
    const { error } = await supabase.from("sessions").update({ minutes: parseInt(minutes, 10), note: note.trim() || null, logged_at: new Date(when).toISOString() }).eq("id", session.id);
    setBusy(false);
    if (error) { toast.error(`Couldn't save the session: ${error.message}`); return; }
    toast.success("Session updated.");
    onSaved();
    onClose();
  }
  return (
    <Dialog open={!!session} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Edit session</DialogTitle></DialogHeader>
        <form onSubmit={save} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sm">Minutes</Label>
            <Input id="sm" className="h-12" type="number" inputMode="numeric" min={1} max={MAX_MIN} value={minutes} onChange={(e) => setMinutes(e.target.value)} aria-invalid={!!errs.minutes} />
            {errs.minutes && <p className="text-xs text-destructive-strong">{errs.minutes}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="sw">Date and time</Label>
            <Input id="sw" className="h-12" type="datetime-local" max={maxWhen} value={when} onChange={(e) => setWhen(e.target.value)} aria-invalid={!!errs.when} />
            {errs.when && <p className="text-xs text-destructive-strong">{errs.when}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="sn">Note (optional)</Label>
            <Input id="sn" className="h-12" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button type="submit" className="h-12 w-full" disabled={busy || submittingEditSession || !!errs.minutes || !!errs.when}>Save</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
