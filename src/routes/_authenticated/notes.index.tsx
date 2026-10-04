import { ScreenSkeleton } from "@/components/app/ScreenSkeleton";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { formatDistanceToNow } from "date-fns";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchPaged, useRoutes, type Note } from "@/lib/data";
import { Empty, NativeSelect } from "@/components/app/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/notes/")({
  validateSearch: z.object({ route: z.string().optional() }),
  head: () => ({ meta: [{ property: "og:title", content: "Notes — Ascent" }, { property: "og:description", content: "Your notes across every route." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { title: "Notes — Ascent" }, { name: "description", content: "Your notes across every route." }] }),
  component: Notes,
});

export const notesQuery = { queryKey: ["notes"], queryFn: () => fetchPaged<Note>((a, b) => supabase.from("notes").select("*, routes!inner(id)").is("routes.deleted_at", null).order("updated_at", { ascending: false }).order("id").range(a, b)) };

function Notes() {
  const { route } = Route.useSearch();
  const nav = useNavigate();
  const { data: routes } = useRoutes();
  const all = routes ? { routes } : undefined;
  const { data: notes } = useQuery(notesQuery);
  const [q, setQ] = useState("");

  const list = (notes ?? []).filter(
    (n) => (!route || n.route_id === route) && (!q || `${n.title} ${n.body}`.toLowerCase().includes(q.toLowerCase())),
  );
  const routeName = (id: string) => all?.routes.find((r) => r.id === id)?.name ?? "";

  function create() {
    if (!all?.routes.length) { toast.error("Create a Route first."); return; }
    // Draft: nothing is saved until the first keystroke.
    nav({ to: "/notes/new", search: { route } });
  }

  if (!notes || !routes) return <ScreenSkeleton screen="notes" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Notes</h1>
        <Button className="h-12" onClick={create}><Plus className="h-4 w-4" /> New note</Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_16rem]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-12 pl-9" placeholder="Search all notes" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <NativeSelect value={route ?? ""} onChange={(e) => nav({ to: "/notes", search: { route: e.target.value || undefined } })}>
          <option value="">All routes</option>
          {all?.routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </NativeSelect>
      </div>
      {list.length === 0 ? (
        <Empty>{q ? "No notes match that search." : "No notes yet. Capture what you learn while it's fresh."}</Empty>
      ) : (
        <ul className="space-y-2">
          {list.map((n) => (
            <li key={n.id}>
              <Link to="/notes/$id" params={{ id: n.id }} className="surface block p-4 hover:border-primary/50">
                <p className="truncate font-medium">{n.title || n.body.split("\n")[0] || "Untitled"}</p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{n.body.replace(/[#*_`>]/g, "")}</p>
                <p className="mt-2 text-xs text-muted-foreground">{routeName(n.route_id)} · {formatDistanceToNow(new Date(n.updated_at), { addSuffix: true })}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
