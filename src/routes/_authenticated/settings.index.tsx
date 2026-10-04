import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Download, LogOut, ShieldCheck, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchPaged } from "@/lib/data";
import { deleteMyAccount } from "@/lib/access.functions";
import { AccountSection } from "@/components/app/AccountSection";
import { ReviewSettings } from "@/components/app/ReviewSettings";
import { SectionTitle } from "@/components/app/fields";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/settings/")({
  head: () => ({ meta: [{ title: "Settings — Ascent" }, { name: "description", content: "Your account, data and privacy." }] }),
  component: Settings,
});

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const csvCell = (s: string | null) => `"${(s ?? "").replace(/"/g, '""')}"`;

function Settings() {
  const { user, role } = Route.useRouteContext();
  const qc = useQueryClient();
  const navigate = useNavigate();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  async function exportData() {
    // Export needs everything; page through each table so nothing is cut at 1,000 rows.
    const page = <K extends "routes" | "milestones" | "sessions" | "cards" | "reviews" | "checkins" | "notes">(t: K) =>
      fetchPaged((a, b) => supabase.from(t).select("*").order("id").range(a, b));
    const [routes, milestones, sessions, cards, reviews, checkins, notes] = await Promise.all([
      page("routes"), page("milestones"), page("sessions"), page("cards"), page("reviews"), page("checkins"), page("notes"),
    ]);
    const all = { routes, milestones, sessions, cards, reviews, checkins } as {
      routes: { id: string; name: string }[]; cards: { front: string; back: string; example: string | null; pronunciation: string | null; route_id: string }[];
      [k: string]: unknown[];
    };
    const stamp = new Date().toISOString().slice(0, 10);
    download(`ascent-export-${stamp}.json`, JSON.stringify({ exported_at: new Date().toISOString(), email: user.email, ...all, notes }, null, 2), "application/json");
    const rows = ["front,back,example,pronunciation,route", ...all.cards.map((c) => [c.front, c.back, c.example, c.pronunciation, all.routes.find((r) => r.id === c.route_id)?.name ?? ""].map(csvCell).join(","))];
    download(`ascent-flashcards-${stamp}.csv`, rows.join("\n"), "text/csv");
  }

  async function deleteAccount() {
    try {
      await deleteMyAccount();
      await qc.cancelQueries();
      qc.clear();
      await supabase.auth.signOut();
      navigate({ to: "/", replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete account");
    }
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">{user.email} · {role === "owner" ? "Owner" : "Member"}</p>
      </div>

      {role === "owner" && (
        <Link to="/settings/access" className="surface tap flex items-center gap-3 p-4 hover:border-primary/50">
          <Users className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <p className="font-medium">Access</p>
            <p className="text-sm text-muted-foreground">Invite people, see who's joined, revoke access.</p>
          </div>
        </Link>
      )}

      <ReviewSettings />

      <AccountSection email={user.email ?? ""} />

      <section>
        <SectionTitle>Privacy</SectionTitle>
        <div className="surface flex gap-3 p-4 text-sm leading-relaxed">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p>
            Your routes, notes, cards and sessions are private to you. The owner of this Ascent only manages who has access and can see members' email and sign-up date, never anyone's content. Nothing is shared, sold or used for anything else, and there are no analytics or trackers.
          </p>
        </div>
      </section>

      <section>
        <SectionTitle>Your data</SectionTitle>
        <div className="space-y-2">
          <Button variant="outline" className="h-12 w-full justify-start" onClick={exportData}>
            <Download className="h-4 w-4" /> Export all my data (JSON + flashcards CSV)
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="h-12 w-full justify-start text-destructive">
                <Trash2 className="h-4 w-4" /> Delete my account and all data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account permanently?</AlertDialogTitle>
                <AlertDialogDescription>All your routes, notes, flashcards, sessions and check-ins are erased and cannot be recovered. Consider exporting first.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={deleteAccount} className="bg-destructive text-destructive-foreground">Delete everything</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </section>

      <Button variant="ghost" className="h-12" onClick={signOut}><LogOut className="h-4 w-4" /> Sign out</Button>
    </div>
  );
}
