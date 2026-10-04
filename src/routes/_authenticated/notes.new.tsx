import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { NoteEditor } from "@/components/app/NoteEditor";

export const Route = createFileRoute("/_authenticated/notes/new")({
  validateSearch: z.object({ route: z.string().optional() }),
  head: () => ({ meta: [{ property: "og:title", content: "New note — Ascent" }, { property: "og:description", content: "Capture what you learn." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { title: "New note — Ascent" }, { name: "description", content: "Capture what you learn." }] }),
  component: NewNote,
});

function NewNote() {
  const { route } = Route.useSearch();
  return <NoteEditor initialRoute={route} />;
}
