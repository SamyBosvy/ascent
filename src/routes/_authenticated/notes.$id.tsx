import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Layers, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { must, useAll, type Note } from "@/lib/data";
import { CardDialog } from "@/components/app/CardDialog";
import { NativeSelect } from "@/components/app/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/notes/$id")({
  head: () => ({ meta: [{ title: "Note — Ascent" }, { name: "description", content: "Write and review a note." }] }),
  component: NoteEditor,
});

function NoteEditor() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: all } = useAll();
  const { data: note } = useQuery({ queryKey: ["note", id], queryFn: () => must<Note>(supabase.from("notes").select("*").eq("id", id).single()) });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [routeId, setRouteId] = useState("");
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [selection, setSelection] = useState("");
  const [cardOpen, setCardOpen] = useState(false);
  const [saved, setSaved] = useState(true);
  const loaded = useRef(false);
  const ta = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (note && !loaded.current) {
      loaded.current = true;
      setTitle(note.title);
      setBody(note.body);
      setRouteId(note.route_id);
      if (note.body) setMode("preview");
    }
  }, [note]);

  useEffect(() => {
    if (!loaded.current) return;
    setSaved(false);
    const t = setTimeout(async () => {
      const { error } = await supabase.from("notes").update({ title, body, route_id: routeId, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) toast.error(error.message);
      else {
        setSaved(true);
        qc.invalidateQueries({ queryKey: ["notes"] });
      }
    }, 700);
    return () => clearTimeout(t);
  }, [title, body, routeId, id, qc]);

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

  if (!note) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Link to="/notes" className="text-sm text-muted-foreground">← Notes</Link>
        <span className="text-xs text-muted-foreground">{saved ? "Saved" : "Saving…"}</span>
      </div>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="h-14 border-0 px-0 font-display text-2xl font-semibold shadow-none focus-visible:ring-0" />
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect className="w-auto min-w-48" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
          {all?.routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </NativeSelect>
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
          onChange={(e) => setBody(e.target.value)}
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
      <Button
        variant="ghost"
        className="h-12 text-destructive"
        onClick={async () => {
          if (!confirm("Delete this note?")) return;
          await supabase.from("notes").delete().eq("id", id);
          qc.invalidateQueries({ queryKey: ["notes"] });
          nav({ to: "/notes" });
        }}
      >
        <Trash2 className="h-4 w-4" /> Delete note
      </Button>
      <CardDialog open={cardOpen} onOpenChange={setCardOpen} routeId={routeId} initialFront={selection} />
    </div>
  );
}
