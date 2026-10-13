import { ScreenSkeleton } from "@/components/app/ScreenSkeleton";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Note } from "@/lib/data";
import { NoteEditor } from "@/components/app/NoteEditor";
import { Empty } from "@/components/app/fields";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/notes/$id")({
  head: () => ({ meta: [{ property: "og:title", content: "Note — Ascent" }, { property: "og:description", content: "Write and review a note." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { title: "Note — Ascent" }, { name: "description", content: "Write and review a note." }] }),
  component: NotePage,
});

function NotePage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: note, error, refetch } = useQuery({
    queryKey: ["note", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("notes").select("*").eq("id", id).single();
      if (error) {
        if (error.code === "PGRST116") throw Object.assign(new Error("not_found"), { notFound: true });
        throw error;
      }
      return data as Note;
    },
    staleTime: Infinity,
    retry: (n, e) => !(e as { notFound?: boolean }).notFound && n < 2,
    initialData: () => {
      for (const [, rows] of qc.getQueriesData<Note[]>({ queryKey: ["notes", "list"] })) {
        const hit = rows?.find((n) => n.id === id);
        if (hit) {
          const { routes: _join, ...rest } = hit as Note & { routes?: unknown };
          return rest as Note;
        }
      }
      return undefined;
    },
    initialDataUpdatedAt: 0,
  });
  if (note) return <NoteEditor key={note.id} note={note} />;
  if (error) {
    const back = <Link to="/notes" className="inline-flex min-h-12 items-center body-text text-primary-strong underline underline-offset-4">Back to notes</Link>;
    if ((error as { notFound?: boolean }).notFound) {
      return <Empty illustration="notebook" title="This note doesn't exist anymore." description="It may have been deleted on another device." primaryAction={back} />;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return <Empty illustration="notebook" title="You're offline." description="This note hasn't been opened on this device yet, so it isn't available until you reconnect." primaryAction={back} />;
    }
    return (
      <Empty
        illustration="notebook"
        title="Couldn't load this note."
        description="Something went wrong while loading it."
        primaryAction={<Button className="h-12" onClick={() => void refetch()}>Try again</Button>}
        secondaryLink={back}
      />
    );
  }
  return <ScreenSkeleton screen="editor" />;
}
