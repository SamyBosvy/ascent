import { ScreenSkeleton } from "./ScreenSkeleton";
import { Link, getRouteApi, useNavigate } from "@tanstack/react-router";
import { draftIsNewer, draftKey, moveDraft, readDraft, removeDraft, retryDelay, writeDraft } from "@/lib/noteDraft";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Layers, Trash2, X } from "lucide-react";
import { addTags } from "@/lib/search";
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

type Status = "saved" | "pending" | "saving" | "draft" | "retrying";

/**
 * Note editor. `note` undefined = draft: no row exists until the first real edit.
 * Saves only after user edits (never on load), serialised through one promise chain.
 */
export function NoteEditor({ note, initialRoute }: { note?: Note; initialRoute?: string | undefined }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: routes } = useRoutes();
  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [routeId, setRouteId] = useState(note?.route_id ?? initialRoute ?? "");
  const [tags, setTags] = useState<string[]>(note?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [tagError, setTagError] = useState("");
  const [barBottom, setBarBottom] = useState(0);
  const [showBar, setShowBar] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mode, setMode] = useState<"write" | "preview">(note?.body ? "preview" : "write");
  const [selection, setSelection] = useState("");
  const [cardOpen, setCardOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [status, setStatus] = useState<Status>(note ? "saved" : "draft");
  const ta = useRef<HTMLTextAreaElement>(null);

  const idRef = useRef<string | null>(note?.id ?? null);
  const latest = useRef({ title, body, routeId, tags });
  latest.current = { title, body, routeId, tags };
  const dirty = useRef(false);
  const inflight = useRef(0);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleted = useRef(false);

  const { user } = getRouteApi("/_authenticated").useRouteContext();
  const userId = user.id;
  const failing = useRef(false);
  const attempts = useRef(0);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyFor = (id: string | null) => draftKey(userId, id);

  function clearRetry() {
    if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
  }
  function scheduleRetry() {
    clearRetry();
    if (deleted.current) return;
    retryRef.current = setTimeout(() => { retryRef.current = null; dirty.current = true; void flush(); }, retryDelay(attempts.current));
    attempts.current++;
  }

  async function doSave() {
    if (!dirty.current || deleted.current) return;
    const v = latest.current;
    if (!v.routeId) return; // waits for the route picker
    const empty = !v.title.trim() && !v.body.trim() && !v.tags.length;
    if (!idRef.current && empty) { dirty.current = false; removeDraft(keyFor(null)); return; }
    dirty.current = false;
    inflight.current++;
    setStatus("saving");
    let data: { id: string } | null = null;
    let error: { message: string } | null = null;
    try {
      const res = idRef.current
        ? await supabase.from("notes").update({ title: v.title, body: v.body, route_id: v.routeId, tags: v.tags }).eq("id", idRef.current).select("id").single()
        : await supabase.from("notes").insert({ title: v.title, body: v.body, route_id: v.routeId, tags: v.tags }).select("id").single();
      data = res.data; error = res.error;
    } catch (e) {
      error = { message: e instanceof Error ? e.message : "Couldn't save the note." };
    }
    inflight.current--;
    if (deleted.current) return;
    if (error || !data) {
      dirty.current = true;
      setStatus("retrying");
      if (!failing.current) {
        failing.current = true;
        const offline = typeof navigator !== "undefined" && navigator.onLine === false;
        toast.error(offline ? "You're offline. Your note is kept on this device and will save when you're back online." : error?.message ?? "Couldn't save the note.", { id: "note-save-error" });
      }
      scheduleRetry();
      return;
    }
    if (!idRef.current) moveDraft(keyFor(null), keyFor(data.id));
    idRef.current = data.id;
    if (failing.current) { failing.current = false; toast.dismiss("note-save-error"); }
    attempts.current = 0;
    clearRetry();
    if (!dirty.current) { setStatus("saved"); removeDraft(keyFor(data.id)); }
    void qc.invalidateQueries({ queryKey: ["notes"] });
    void qc.invalidateQueries({ queryKey: ["note", data.id] });
  }
  function flush() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    chain.current = chain.current.then(doSave);
    return chain.current;
  }
  function persistDraft() {
    writeDraft(keyFor(idRef.current), { ...latest.current, savedAt: new Date().toISOString() });
  }
  function edit() {
    dirty.current = true;
    persistDraft();
    setStatus(failing.current ? "retrying" : "pending");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flush(), 700);
  }

  // Restore an unsaved local draft that is newer than the server copy.
  useEffect(() => {
    const key = keyFor(idRef.current);
    const draft = readDraft(key);
    if (!draft) return;
    if (!draftIsNewer(draft, note?.updated_at)) { removeDraft(key); return; }
    const next = { title: draft.title, body: draft.body, routeId: draft.routeId || latest.current.routeId, tags: draft.tags };
    setTitle(next.title); setBody(next.body); setRouteId(next.routeId); setTags(next.tags);
    latest.current = next;
    dirty.current = true;
    setStatus("pending");
    toast("Restored unsaved changes.");
    void flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retry immediately when the connection returns.
  useEffect(() => {
    const onOnline = () => { if (failing.current && !deleted.current) { clearRetry(); dirty.current = true; void flush(); } };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current || inflight.current > 0) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  // Leaving within the app: flush the pending save, then drop a completely empty note.
  // Retry timers stop on unmount; the local draft stays until a later save succeeds.
  useEffect(() => () => {
    clearRetry();
    void flush().then(async () => {
      clearRetry();
      const v = latest.current;
      if (idRef.current && !deleted.current && !v.title.trim() && !v.body.trim() && !v.tags.length) {
        await supabase.from("notes").delete().eq("id", idRef.current);
        removeDraft(keyFor(idRef.current));
      }
      void qc.invalidateQueries({ queryKey: ["notes"] });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Selection → card works with touch: track selections inside the editor (textarea or preview)
  // through selectionchange, and keep the bar briefly after a tap collapses the selection.
  useEffect(() => {
    const read = () => {
      const el = ta.current;
      if (el && document.activeElement === el && el.selectionEnd > el.selectionStart) return el.value.slice(el.selectionStart, el.selectionEnd).trim();
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.anchorNode && editorRef.current?.contains(sel.anchorNode)) return sel.toString().trim();
      return "";
    };
    const onSel = () => {
      const s = read();
      if (s) {
        if (hideTimer.current) clearTimeout(hideTimer.current);
        setSelection(s);
        setShowBar(true);
      } else {
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setShowBar(false), 600);
      }
    };
    const vv = window.visualViewport;
    const onVV = () => { if (vv) setBarBottom(Math.max(0, window.innerHeight - vv.height - vv.offsetTop)); };
    document.addEventListener("selectionchange", onSel);
    vv?.addEventListener("resize", onVV);
    vv?.addEventListener("scroll", onVV);
    return () => {
      document.removeEventListener("selectionchange", onSel);
      vv?.removeEventListener("resize", onVV);
      vv?.removeEventListener("scroll", onVV);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  function commitTags(input: string) {
    const { tags: next, error } = addTags(tags, input);
    setTagError(error ?? "");
    setTagInput("");
    if (next.length !== tags.length) { setTags(next); latest.current = { ...latest.current, tags: next }; edit(); }
  }
  function removeTag(t: string) {
    const next = tags.filter((x) => x !== t);
    setTags(next);
    latest.current = { ...latest.current, tags: next };
    edit();
  }
  function openCardFromSelection() {
    captureTextarea();
    setShowBar(false);
    setCardOpen(true);
  }

  function captureTextarea() {
    const el = ta.current;
    if (el && el.selectionEnd > el.selectionStart) setSelection(el.value.slice(el.selectionStart, el.selectionEnd).trim());
  }

  async function remove() {
    deleted.current = true;
    clearRetry();
    if (timerRef.current) clearTimeout(timerRef.current);
    await chain.current;
    if (idRef.current) {
      const { error } = await supabase.from("notes").delete().eq("id", idRef.current);
      if (error) { deleted.current = false; toast.error(error.message); return; }
    }
    removeDraft(keyFor(idRef.current));
    removeDraft(keyFor(null));
    if (failing.current) { failing.current = false; toast.dismiss("note-save-error"); }
    void qc.invalidateQueries({ queryKey: ["notes"] });
    nav({ to: "/notes" });
  }

  const pickable = (routes ?? []).filter((r) => isLive(r) || r.id === routeId);
  const needsRoute = !routeId;
  const label = status === "retrying" ? "Not saved yet — will retry" : status === "saved" ? "Saved" : status === "saving" ? "Saving…" : status === "draft" ? "Draft" : needsRoute ? "Pick a route to save" : "Saving…";

  if (!routes) return <ScreenSkeleton screen="editor" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Link to="/notes" className="body-text text-muted-foreground">← Notes</Link>
        <span className="meta-text text-muted-foreground">{label}</span>
      </div>
      {needsRoute && (
        <div className="surface space-y-2 border-primary/60 p-4">
          <p className="body-text font-medium">Which route does this note belong to?</p>
          <NativeSelect aria-label="Note route" value="" onChange={(e) => { setRouteId(e.target.value); if (title.trim() || body.trim()) edit(); }}>
            <option value="" disabled>Choose a route…</option>
            {pickable.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </NativeSelect>
        </div>
      )}
      <Input aria-label="Note title" value={title} onChange={(e) => { setTitle(e.target.value); edit(); }} placeholder="Title" className="h-14 border-0 px-0 page-title shadow-none focus-visible:ring-0" />
      <div className="space-y-1">
        <label htmlFor="note-tags" className="sr-only">Tags</label>
        <div className="flex flex-wrap items-center gap-2">
          {tags.map((t) => (
            <span key={t} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-secondary pl-3 body-text text-secondary-foreground">
              #{t}
              <button type="button" onClick={() => removeTag(t)} aria-label={`Remove tag ${t}`} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-accent"><X className="h-3.5 w-3.5" /></button>
            </span>
          ))}
          {tags.length < 10 && (
            <Input id="note-tags" value={tagInput} placeholder={tags.length ? "Add tag" : "Add tags (comma or Enter)"} maxLength={300}
              className="h-10 w-48 border-dashed" aria-describedby="note-tags-help"
              onChange={(e) => { const v = e.target.value; if (v.includes(",")) commitTags(v); else setTagInput(v); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitTags(tagInput); }
                else if (e.key === "Backspace" && !tagInput && tags.length) removeTag(tags[tags.length - 1]!);
              }}
              onBlur={() => { if (tagInput.trim()) commitTags(tagInput); }} />
          )}
        </div>
        <p id="note-tags-help" className={`meta-text ${tagError ? "text-destructive-strong" : "sr-only"}`} aria-live="polite">{tagError || "Up to 10 tags, 30 characters each."}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!needsRoute && (
          <NativeSelect aria-label="Note route" className="w-auto min-w-48" value={routeId} onChange={(e) => { setRouteId(e.target.value); edit(); }}>
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
          onPointerDown={(e) => { if (e.pointerType === "mouse") e.preventDefault(); }}
          onClick={openCardFromSelection}
        >
          <Layers className="h-4 w-4" /> Selection → card
        </Button>
      </div>
      <div ref={editorRef}>
      {mode === "write" ? (
        <textarea
          aria-label="Note body"
          ref={ta}
          value={body}
          onChange={(e) => { setBody(e.target.value); edit(); }}
          onSelect={captureTextarea}
          placeholder="Write in markdown…"
          className="min-h-[55vh] w-full resize-y rounded-xl border border-input bg-card p-4 body-text text-base leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      ) : (
        <article className="prose-note surface min-h-[55vh] p-5">
          {body ? <ReactMarkdown>{body}</ReactMarkdown> : <p className="text-muted-foreground">Nothing written yet.</p>}
        </article>
      )}
      </div>
      {showBar && selection && !cardOpen && (
        <div className="fixed inset-x-0 z-40 flex justify-center px-4 pb-2" style={{ bottom: `calc(${barBottom}px + env(safe-area-inset-bottom) + 5.5rem)` }}>
          <Button className="h-12 shadow-lg" onPointerDown={(e) => { if (e.pointerType === "mouse") e.preventDefault(); }} onClick={openCardFromSelection}>
            <Layers className="h-4 w-4" /> Make card
          </Button>
        </div>
      )}
      <p className="meta-text text-muted-foreground">Select text in the note (write or preview), then tap "Make card" to turn it into a flashcard.</p>
      <Button variant="ghost" className="h-12 text-destructive-strong" onClick={() => setConfirmDelete(true)}>
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
