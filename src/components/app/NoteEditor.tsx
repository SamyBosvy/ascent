import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Layers, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isLive, useRoutes, type Note } from "@/lib/data";
import { CardDialog } from "@/components/app/CardDialog";
import { NativeSelect } from "@/components/app/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Status = "saved" | "pending" | "saving" | "draft";

/**
 * Note editor. `note` undefined = draft: no row exists until the first real edit.
 * Saves only after user edits (never on load), serialised through one promise chain.
 */
export function NoteEditor({ note, initialRoute }: { note?: Note; initialRoute?: string }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: routes } = useRoutes();
  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [routeId, setRouteId] = useState(note?.route_id ?? initialRoute ?? "");
  const [mode, setMode] = useState<"write" | "preview">(note?.body ? "preview" : "write");
  const [selection, setSelection] = useState("");
  const [cardOpen, setCardOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [status, setStatus] = useState<Status>(note ? "saved" : "draft");
  const ta = useRef<HTMLTextAreaElement>(null);

  const idRef = useRef<string | null>(note?.id ?? null);
  const latest = useRef({ title, body, routeId });
  latest.current = { title, body, routeId };
  const dirty = useRef(false);
  const inflight = useRef(0);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleted = useRef(false);

  async function doSave() {
    if (!dirty.current || deleted.current) return;
    const v = latest.current;
    if (!v.routeId) return; // waits for the route picker
    const empty = !v.title.trim() && !v.body.trim();
    if (!idRef.current && empty) { dirty.current = false; return; }
    dirty.current = false;
    inflight.current++;
    setStatus("saving");
    const { data, error } = idRef.current
      ? await supabase.from("notes").update({ title: v.title, body: v.body, route_id: v.routeId, updated_at: new Date().toISOString() }).eq("id", idRef.current).select("id").single()
      : await supabase.from("notes").insert({ title: v.title, body: v.body, route_id: v.routeId }).select("id").single();
    inflight.current--;
    if (error || !data) {
      dirty.current = true;
      setStatus("pending");
      toast.error(error?.message ?? "Couldn't save the note.");
      return;
    }
    idRef.current = data.id;
    if (!dirty.current) setStatus("saved");
    void qc.invalidateQueries({ queryKey: ["notes"] });
    void qc.invalidateQueries({ queryKey: ["note", data.id] });
  }
  function flush() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    chain.current = chain.current.then(doSave);
    return chain.current;
  }
  function edit() {
    dirty.current = true;
    setStatus("pending");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flush(), 700);
  }

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current || inflight.current > 0) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  // Leaving within the app: flush the pending save, then drop a completely empty note.
  useEffect(() => () => {
    void flush().then(async () => {
      const v = latest.current;
      if (idRef.current && !deleted.current && !v.title.trim() && !v.body.trim()) {
        await supabase.from("notes").delete().eq("id", idRef.current);
      }
      void qc.invalidateQueries({ queryKey: ["notes"] });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onSel = () => {
      const s = window.getSelection()?.toString().trim();
      if (s) setSelection(s);
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);

  function captureTextarea() {
    const el = ta.current;
    if (el && el.selectionEnd > el.selectionStart) setSelection(el.value.slice(el.selectionStart, el.selectionEnd).trim());
  }

  async function remove() {
    deleted.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    await chain.current;
    if (idRef.current) {
      const { error } = await supabase.from("notes").delete().eq("id", idRef.current);
      if (error) { deleted.current = false; toast.error(error.message); return; }
    }
    void qc.invalidateQueries({ queryKey: ["notes"] });
    nav({ to: "/notes" });
  }

  const pickable = (routes ?? []).filter((r) => isLive(r) || r.id === routeId);
  const needsRoute = !routeId;
  const label = status === "saved" ? "Saved" : status === "saving" ? "Saving…" : status === "draft" ? "Draft" : needsRoute ? "Pick a route to save" : "Saving…";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Link to="/notes" className="text-sm text-muted-foreground">← Notes</Link>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      {needsRoute && (
        <div className="surface space-y-2 border-primary/60 p-4">
          <p className="text-sm font-medium">Which route does this note belong to?</p>
          <NativeSelect value="" onChange={(e) => { setRouteId(e.target.value); if (title.trim() || body.trim()) edit(); }}>
            <option value="" disabled>Choose a route…</option>
            {pickable.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </NativeSelect>
        </div>
      )}
      <Input value={title} onChange={(e) => { setTitle(e.target.value); edit(); }} placeholder="Title" className="h-14 border-0 px-0 font-display text-2xl font-semibold shadow-none focus-visible:ring-0" />
      <div className="flex flex-wrap items-center gap-2">
        {!needsRoute && (
          <NativeSelect className="w-auto min-w-48" value={routeId} onChange={(e) => { setRouteId(e.target.value); edit(); }}>
            {pickable.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </NativeSelect>
        )}
        <Tabs value={mode} onValueChange={(v) => setMode(v as "write" | "preview")}>
          <TabsList className="h-12">
            <TabsTrigger value="write" className="h-10 px-4">Write</TabsTrigger>
            <TabsTrigger value="preview" className="h-10 px-4">Preview</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button
          variant="outline"
          className="h-12"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            captureTextarea();
            setCardOpen(true);
          }}
        >
          <Layers className="h-4 w-4" /> Selection → card
        </Button>
      </div>
      {mode === "write" ? (
        <textarea
          ref={ta}
          value={body}
          onChange={(e) => { setBody(e.target.value); edit(); }}
          onSelect={captureTextarea}
          placeholder="Write in markdown…"
          className="min-h-[55vh] w-full resize-y rounded-xl border bg-card p-4 font-mono text-[15px] leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      ) : (
        <article className="prose-note surface min-h-[55vh] p-5">
          {body ? <ReactMarkdown>{body}</ReactMarkdown> : <p className="text-muted-foreground">Nothing written yet.</p>}
        </article>
      )}
      <p className="text-xs text-muted-foreground">Select text in the note, then tap "Selection → card" to turn it into a flashcard.</p>
      <Button variant="ghost" className="h-12 text-destructive" onClick={() => setConfirmDelete(true)}>
        <Trash2 className="h-4 w-4" /> Delete note
      </Button>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this note?</AlertDialogTitle>
            <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {routeId && <CardDialog open={cardOpen} onOpenChange={setCardOpen} routeId={routeId} initialFront={selection} />}
    </div>
  );
}
