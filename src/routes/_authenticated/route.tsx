import { ScreenSkeleton } from "@/components/app/ScreenSkeleton";
import { createFileRoute, Link, Outlet, redirect, useLocation, useNavigate } from "@tanstack/react-router";
import { BarChart3, BookOpen, Layers, Library, Mountain, Plus, Search, Settings, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SessionPill, StaleSessionPrompt } from "@/components/app/SessionPill";
import { MobileNavigation } from "@/components/app/MobileNavigation";
import { supabase } from "@/integrations/supabase/client";
import { QuickCapture } from "@/components/app/QuickCapture";
import { CommandPalette } from "@/components/app/CommandPalette";
import { useUserSettings } from "@/lib/data";
import { setPrefs } from "@/lib/prefs";
import type { User } from "@supabase/supabase-js";
import { startSync, syncNow, useOnline, usePendingCount } from "@/lib/sync";
import { startPersisting } from "@/lib/persist";
import { applyUpdate, onUpdateReady, registerServiceWorker } from "@/lib/pwa";
import { CloudOff } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const offline = await offlineIdentity();
    if (offline) return offline;
    const { data, error } = await supabase.auth.getUser();
    if (error && isNetworkError(error)) {
      const fallback = await offlineIdentity(true);
      if (fallback) return fallback;
    }
    if (error || !data.user) throw redirect({ to: "/" });
    const { data: role, error: roleError } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).maybeSingle();
    if (roleError && isNetworkError(roleError)) {
      const fallback = await offlineIdentity(true);
      if (fallback) return fallback;
    }
    if (!role) {
      await supabase.auth.signOut();
      throw redirect({ to: "/", search: { revoked: true } });
    }
    rememberIdentity(data.user, role.role);
    return { user: data.user, role: role.role };
  },
  pendingComponent: () => <main className="mx-auto max-w-4xl px-4 py-10"><ScreenSkeleton screen="today" /></main>,
  component: Shell,
});

// Offline: never sign the user out because the server can't be reached. Use the locally stored
// session (and the role last confirmed online, display only — the database enforces access).
const IDENTITY_KEY = "ascent:identity";
type Identity = { user: User; role: string };
function isNetworkError(e: { message?: string | undefined; name?: string | undefined; status?: number | undefined; code?: string | undefined }) {
  return e.name === "AuthRetryableFetchError" || e.status === 0 || /fetch|network|load failed/i.test(e.message ?? "");
}
function rememberIdentity(user: User, role: string) {
  localStorage.setItem(IDENTITY_KEY, JSON.stringify({ user: { id: user.id, email: user.email }, role }));
}
async function offlineIdentity(force = false): Promise<Identity | null> {
  if (!force && navigator.onLine) return null;
  let cached: Identity | null = null;
  try { cached = JSON.parse(localStorage.getItem(IDENTITY_KEY) ?? "null") as Identity | null; } catch { cached = null; }
  const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  const id = data.session?.user.id ?? cached?.user.id;
  if (!cached || !id || cached.user.id !== id) return null;
  return { user: (data.session?.user ?? cached.user) as User, role: cached.role };
}

const NAV = [
  { to: "/today", label: "Today", icon: Sun },
  { to: "/routes", label: "Routes", icon: Mountain },
  { to: "/review", label: "Review", icon: Layers },
  { to: "/cards", label: "Cards", icon: Library, desktopOnly: true },
  { to: "/notes", label: "Notes", icon: BookOpen },
  { to: "/insights", label: "Insights", icon: BarChart3 },
] as const;

function Shell() {
  const [capture, setCapture] = useState(false);
  const [palette, setPalette] = useState(false);
  const qc = useQueryClient();
  const { data: settings } = useUserSettings();

  // The database row is the source of truth; cache it locally (instant theme on next load) and
  // refetch date-based data when timezone or week start differ from the cached values.
  useEffect(() => {
    if (!settings) return;
    const changed = setPrefs({ theme: settings.theme, weekStart: settings.week_start, tz: settings.timezone });
    if (changed) void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "user-settings" });
  }, [settings, qc]);

  // ⌘K / Ctrl+K opens search and commands from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopPropagation();
        setPalette((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // Offline cache + outbox: restore last-loaded data, send queued changes on open and on reconnect.
  const { user } = Route.useRouteContext();
  const online = useOnline();
  const pending = usePendingCount();
  useEffect(() => {
    void startPersisting(qc, user.id);
    void startSync(qc, user.id);
    const run = () => void syncNow();
    window.addEventListener("online", run);
    // Finish any route deletions whose undo window has passed.
    if (navigator.onLine) void supabase.rpc("purge_deleted_routes", { _older_than_seconds: 30 });
    return () => window.removeEventListener("online", run);
  }, [qc, user.id]);

  // App updates wait for the user; never interrupt a review in progress.
  const location = useLocation();
  const [updateReady, setUpdateReady] = useState(false);
  useEffect(() => { void registerServiceWorker(); return onUpdateReady(() => setUpdateReady(true)); }, []);
  const inReview = location.pathname.startsWith("/review");
  useEffect(() => {
    if (!updateReady || inReview) return;
    const t = toast("Update available", { id: "app-update", duration: Infinity, action: { label: "Reload", onClick: () => applyUpdate() } });
    return () => { toast.dismiss(t); };
  }, [updateReady, inReview]);

  // Manifest shortcut: /today?capture=1 opens Quick capture.
  const navigate = useNavigate();
  useEffect(() => {
    const sp = new URLSearchParams(location.searchStr);
    if (sp.get("capture") !== "1") return;
    setCapture(true);
    void navigate({ to: location.pathname, search: {} as never, replace: true });
  }, [location.searchStr, location.pathname, navigate]);

  return (
    <div className="min-h-screen md:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:p-3 focus:text-foreground focus:outline-none focus:ring-2 focus:ring-ring">Skip to content</a>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar p-4 md:flex">
        <Link to="/today" className="mb-8 flex items-center gap-3 px-2 pt-2">
          <img src="/icon-192.png" alt="" className="h-9 w-9 rounded-xl" />
          <span className="font-display text-xl font-semibold">Ascent</span>
        </Link>
        <button onClick={() => setPalette(true)} className="tap mb-4 flex items-center gap-3 rounded-xl border border-input px-3 text-sm text-muted-foreground hover:bg-sidebar-accent" aria-keyshortcuts="Meta+K Control+K">
          <Search className="h-4 w-4" /> <span className="flex-1 text-left">Search</span> <kbd className="text-xs">⌘K</kbd>
        </button>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="tap flex items-center gap-3 rounded-xl px-3 text-sidebar-foreground/75 hover:bg-sidebar-accent"
              activeProps={{ className: "bg-sidebar-accent !text-sidebar-accent-foreground font-semibold", "aria-current": "page" }}
            >
              <Icon className="h-5 w-5" /> {label}
            </Link>
          ))}
        </nav>
        <SessionPill className="mb-2" />
        <button onClick={() => setCapture(true)} className="tap mb-2 flex items-center justify-center gap-2 rounded-xl bg-primary font-medium text-primary-foreground">
          <Plus className="h-5 w-5" /> Quick capture
        </button>
        <Link to="/settings" className="tap flex items-center gap-3 rounded-xl px-3 text-sidebar-foreground/75 hover:bg-sidebar-accent" activeProps={{ className: "bg-sidebar-accent font-semibold", "aria-current": "page" }}>
          <Settings className="h-5 w-5" /> Settings
        </Link>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background/90 px-4 py-2 backdrop-blur md:hidden">
          <Link to="/today" className="flex items-center gap-2">
            <img src="/icon-192.png" alt="" className="h-8 w-8 rounded-lg" />
            <span className="font-display text-lg font-semibold">Ascent</span>
          </Link>
          <div className="flex items-center">
          <button onClick={() => setPalette(true)} aria-label="Search" className="tap flex items-center justify-center rounded-xl text-muted-foreground">
            <Search className="h-5 w-5" />
          </button>
          <Link to="/settings" aria-label="Settings" activeProps={{ "aria-current": "page" }} className="tap flex items-center justify-center rounded-xl text-muted-foreground">
            <Settings className="h-5 w-5" />
          </Link>
          </div>
        </header>
        {(!online || pending > 0) && (
          <div role="status" className="flex items-center justify-center gap-2 border-b bg-muted px-4 py-2 text-sm text-muted-foreground">
            <CloudOff className="h-4 w-4" aria-hidden />
            {online ? `Syncing ${pending} change${pending === 1 ? "" : "s"}…` : `Offline — changes will sync${pending ? ` (${pending} waiting)` : ""}`}
          </div>
        )}
        <main id="main" tabIndex={-1} className="authenticated-main mx-auto w-full max-w-4xl flex-1 px-4 pt-6 md:px-10 md:pt-10">
          <Outlet />
        </main>
      </div>

      <MobileNavigation onQuickCapture={() => setCapture(true)} />

      <QuickCapture open={capture} onOpenChange={setCapture} />
      <CommandPalette open={palette} onOpenChange={setPalette} onQuickCapture={() => setCapture(true)} />
      <StaleSessionPrompt />
    </div>
  );
}
