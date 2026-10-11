import { blockingError } from "@/lib/queryState";
import { ScreenSkeleton } from "@/components/app/ScreenSkeleton";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { formatDistanceToNow } from "date-fns";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchPaged, must, useRoutes, type Note } from "@/lib/data";
import { prefixTsQuery } from "@/lib/search";
import { Empty, NativeSelect } from "@/components/app/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/notes/")({
  validateSearch: z.object({ route: z.string().optional(), tag: z.string().optional() }),
  head: () => ({ meta: [{ property: "og:title", content: "Notes — Ascent" }, { property: "og:description", content: "Your notes across every route." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { title: "Notes — Ascent" }, { name: "description", content: "Your notes across every route." }] }),
  component: Notes,
});

/** Notes for the list: filtered by route/tag and full-text searched in the database, paged. */
export function notesQuery(route?: string, tag?: string, q = "") {
  const tsq = prefixTsQuery(q);
  return {
    queryKey: ["notes", "list", route ?? "", tag ?? "", tsq],
    queryFn: () =>
      fetchPaged<Note>((a, b) => {
        let x = supabase.from("notes").select("*, routes!inner(id)").is("routes.deleted_at", null);
        if (route) x = x.eq("route_id", route);
        if (tag) x = x.contains("tags", [tag]);
        if (tsq) x = x.textSearch("search", tsq, { config: "simple" });
        return x.order("updated_at", { ascending: false }).order("id").range(a, b);
      }),
  };
}

function Notes() {
  const { route, tag } = Route.useSearch();
  const nav = useNavigate();
  const { data: routes, error: routesError } = useRoutes();
  const all = routes ? { routes } : undefined;
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 200); return () => clearTimeout(t); }, [q]);
  const { data: notes, isFetching, error: notesError } = useQuery({ ...notesQuery(route, tag, term), placeholderData: (prev) => prev });
  const { data: tags, error: tagsError } = useQuery({ queryKey: ["notes", "tags"], queryFn: () => must(supabase.rpc("note_tags")) });
  const list = notes ?? [];
  const routeName = (id: string) => all?.routes.find((r) => r.id === id)?.name ?? "";

  function create() {
    if (!all?.routes.length) { toast.error("Create a Route first."); return; }
    // Draft: nothing is saved until the first keystroke.
    nav({ to: "/notes/new", search: { route } });
  }

  { const e = blockingError([routesError, routes], [notesError, notes], [tagsError, tags]); if (e) throw e; }
  if (!notes || !routes) return <ScreenSkeleton screen="notes" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="page-title">Notes</h1>
        <Button className="h-12" onClick={create}><Plus className="h-4 w-4" /> New note</Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_16rem]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-12 pl-9" aria-label="Search notes" placeholder="Search all notes" value={q} onChange={(e) => setQ(e.target.value)} aria-busy={isFetching} />
        </div>
        <NativeSelect aria-label="Filter notes by route" value={route ?? ""} onChange={(e) => nav({ to: "/notes", search: { route: e.target.value || undefined, tag } })}>
          <option value="">All routes</option>
          {all?.routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </NativeSelect>
      </div>
      {tags && tags.length > 0 && (
        <div role="group" aria-label="Filter by tag" className="flex flex-wrap gap-2">
          {tags.map((t) => {
            const on = t.tag === tag;
            return (
              <Link key={t.tag} to="/notes" search={{ route, tag: on ? undefined : t.tag }} aria-current={on ? "true" : undefined}
                className={`inline-flex min-h-12 items-center rounded-full border px-3 body-text ${on ? "border-primary bg-primary text-primary-foreground" : "border-input text-foreground hover:bg-accent"}`}>
                #{t.tag} <span className={`ml-1 meta-text ${on ? "" : "text-muted-foreground"}`}>{t.uses}</span>
              </Link>
            );
          })}
        </div>
      )}
      {list.length === 0 ? (
        <Empty headingLevel={2} illustration="notebook" title={term || tag || route ? "No matching notes" : "No notes yet"} description={term || tag || route ? "Try another search or remove your filters." : "Capture what you learn in a note."} primaryAction={term || tag || route ? <Button onClick={() => { setQ(""); setTerm(""); nav({ to: "/notes", search: {} }); }}>Clear filters</Button> : routes.length ? <Button onClick={create}>New note</Button> : <Button asChild><Link to="/routes">Create route</Link></Button>} />
      ) : (
        <ul className="space-y-2">
          {list.map((n) => (
            <li key={n.id}>
              <Link to="/notes/$id" params={{ id: n.id }} className="surface block p-4 hover:border-primary/50">
                <p className="truncate card-title">{n.title || n.body.split("\n")[0] || "Untitled"}</p>
                <p className="mt-1 line-clamp-2 body-text text-muted-foreground">{n.body.replace(/[#*_`>]/g, "")}</p>
                {n.tags.length > 0 && <p className="mt-2 flex flex-wrap gap-1">{n.tags.map((t) => <span key={t} className="rounded-full bg-secondary px-2 py-0.5 meta-text text-secondary-foreground">#{t}</span>)}</p>}
                <p className="mt-2 meta-text text-muted-foreground">{routeName(n.route_id)} · {formatDistanceToNow(new Date(n.updated_at), { addSuffix: true })}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
