import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { must, type Note } from "@/lib/data";
import { NoteEditor } from "@/components/app/NoteEditor";

export const Route = createFileRoute("/_authenticated/notes/$id")({
  head: () => ({ meta: [{ title: "Note — Ascent" }, { name: "description", content: "Write and review a note." }] }),
  component: NotePage,
});

function NotePage() {
  const { id } = Route.useParams();
  const { data: note, error } = useQuery({ queryKey: ["note", id], queryFn: () => must<Note>(supabase.from("notes").select("*").eq("id", id).single()), staleTime: Infinity });
  if (error) return <p className="text-muted-foreground">This note doesn't exist anymore.</p>;
  if (!note) return <p className="text-muted-foreground">Loading…</p>;
  return <NoteEditor key={note.id} note={note} />;
}
