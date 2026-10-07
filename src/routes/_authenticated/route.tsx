import { ScreenSkeleton } from "@/components/app/ScreenSkeleton";
import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { BarChart3, BookOpen, Layers, Library, Mountain, Plus, Settings, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { flushPendingReviews } from "@/lib/reviewQueue";
import { SessionPill, StaleSessionPrompt } from "@/components/app/SessionPill";
import { supabase } from "@/integrations/supabase/client";
import { QuickCapture } from "@/components/app/QuickCapture";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/" });
    const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).maybeSingle();
    if (!role) {
      await supabase.auth.signOut();
      throw redirect({ to: "/", search: { revoked: true } });
    }
    return { user: data.user, role: role.role };
  },
  pendingComponent: () => <main className="mx-auto max-w-4xl px-4 py-10"><ScreenSkeleton screen="today" /></main>,
  component: Shell,
});

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
  const qc = useQueryClient();

  // Re-send ratings that didn't reach the server earlier (on open and when back online).
  useEffect(() => {
    const run = async () => {
      const n = await flushPendingReviews();
      if (n > 0) {
        toast(`Saved ${n} review${n === 1 ? "" : "s"} that didn't go through earlier.`);
        void qc.invalidateQueries();
      }
    };
    void run();
    // Finish any route deletions whose undo window has passed.
    void supabase.rpc("purge_deleted_routes", { _older_than_seconds: 30 });
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, [qc]);

  return (
    <div className="min-h-screen md:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:p-3 focus:text-foreground focus:outline-none focus:ring-2 focus:ring-ring">Skip to content</a>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar p-4 md:flex">
        <Link to="/today" className="mb-8 flex items-center gap-3 px-2 pt-2">
          <img src="/icon-192.png" alt="" className="h-9 w-9 rounded-xl" />
          <span className="font-display text-xl font-semibold">Ascent</span>
        </Link>
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
          <Link to="/settings" aria-label="Settings" activeProps={{ "aria-current": "page" }} className="tap flex items-center justify-center rounded-xl text-muted-foreground">
            <Settings className="h-5 w-5" />
          </Link>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-4xl flex-1 px-4 pb-32 pt-6 md:px-10 md:pb-12 md:pt-10">
          <Outlet />
        </main>
      </div>

      <div className="fixed inset-x-4 bottom-24 z-30 flex justify-start pr-16 md:hidden">
        <SessionPill className="max-w-full" />
      </div>
      <button
        onClick={() => setCapture(true)}
        aria-label="Quick capture"
        className="fixed bottom-24 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg md:hidden"
      >
        <Plus className="h-6 w-6" />
      </button>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {NAV.filter((n) => !("desktopOnly" in n)).map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex min-h-16 flex-col items-center justify-center gap-1 text-xs text-muted-foreground"
            activeProps={{ className: "!text-primary-strong font-semibold", "aria-current": "page" }}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        ))}
      </nav>

      <QuickCapture open={capture} onOpenChange={setCapture} />
      <StaleSessionPrompt />
    </div>
  );
}
