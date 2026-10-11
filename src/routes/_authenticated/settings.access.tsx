import { blockingError } from "@/lib/queryState";
import { useSubmission } from "@/hooks/use-submission";
import { requireOnline } from "@/lib/sync";
import { ScreenSkeleton } from "@/components/app/ScreenSkeleton";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { format } from "date-fns";
import { Trash2, UserX } from "lucide-react";
import { toast } from "sonner";
import { addAllowed, listAccess, removeAllowed, revokeMember } from "@/lib/access.functions";
import { Empty, SectionTitle } from "@/components/app/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/settings/access")({
  beforeLoad: ({ context }) => {
    if (context.role !== "owner") throw redirect({ to: "/settings" });
  },
  head: () => ({ meta: [{ property: "og:title", content: "Access — Ascent" }, { property: "og:description", content: "Manage who can use Ascent." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { title: "Access — Ascent" }, { name: "description", content: "Manage who can use Ascent." }] }),
  component: Access,
});

function Access() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const list = useServerFn(listAccess);
  const add = useServerFn(addAllowed);
  const remove = useServerFn(removeAllowed);
  const revoke = useServerFn(revokeMember);
  const { data, error: accessError } = useQuery({ queryKey: ["access"], queryFn: () => list() });
  const [email, setEmail] = useState("");
  const reload = () => qc.invalidateQueries({ queryKey: ["access"] });

  const { submitting: submittingInvite, submit: submitInvite } = useSubmission();
  function invite(e: React.FormEvent) { e.preventDefault(); return submitInvite(() => inviteRequest(e)); }
  async function inviteRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!requireOnline("Sending an invite")) return;
    try {
      const res = await add({ data: { email, origin: window.location.origin } });
      setEmail("");
      const copy = { label: "Copy link", onClick: () => { void navigator.clipboard.writeText(res.link); toast.success("Link copied"); } };
      if (res.restored) toast.success("Access restored. They can sign in again.");
      else if (res.emailSent) toast.success("Invitation sent. They'll get an email to set up their account.");
      else toast.warning("Invite saved, but the email couldn't be sent. Share the link manually.", { action: copy, duration: 15000 });
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add");
    }
  }

  { const e = blockingError([accessError, data]); if (e) throw e; }
  if (!data) return <ScreenSkeleton screen="settings" />;

  const members = (data?.members ?? []).filter((m) => m.id !== user.id);
  const memberEmails = new Set((data?.members ?? []).filter((m) => !m.revoked).map((m) => m.email.toLowerCase()));

  return (
    <div className="space-y-10">
      <div>
        <Link to="/settings" className="body-text text-muted-foreground">← Settings</Link>
        <h1 className="mt-2 page-title">Access</h1>
        <p className="mt-1 body-text text-muted-foreground">Only emails on this list can create an account.</p>
      </div>

      <section>
        <SectionTitle>Invite</SectionTitle>
        <form onSubmit={invite} className="flex gap-2">
          <Input id="invite-email" aria-label="Invite email" type="email" required className="h-12" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button disabled={submittingInvite} type="submit" className="h-12">Add</Button>
        </form>
      </section>

      <section>
        <SectionTitle>Allowlist</SectionTitle>
        {!data ? <ScreenSkeleton screen="settings" /> : data.allowlist.length === 0 ? <Empty illustration="tent" title="No invitations yet" description="People you invite will appear here." primaryAction={<Button onClick={() => document.getElementById("invite-email")?.focus()}>Invite someone</Button>} /> : (
          <ul className="surface divide-y">
            {data.allowlist.map((a) => (
              <li key={a.id} className="flex items-center gap-3 p-2 pl-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate body-text">{a.email}</p>
                  <p className="meta-text text-muted-foreground">{memberEmails.has(a.email) ? "Joined" : "Invited, not joined yet"}</p>
                </div>
                {a.email !== user.email?.toLowerCase() && (
                  <Button variant="ghost" className="h-12 w-12" aria-label="Remove from allowlist" onClick={async () => { try { await remove({ data: { id: a.id } }); toast.success("Removed from allowlist."); } catch (err) { toast.error(err instanceof Error ? err.message : "Could not remove"); } reload(); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 meta-text text-muted-foreground">Removing an email stops new sign-ups. To end an existing member's access, revoke them below.</p>
      </section>

      <section>
        <SectionTitle>Members</SectionTitle>
        {members.length === 0 ? <Empty illustration="tent" title="No members yet" description="People who accept an invitation will appear here." primaryAction={<Button onClick={() => document.getElementById("invite-email")?.focus()}>Invite someone</Button>} /> : (
          <ul className="surface divide-y">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 p-2 pl-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate body-text">{m.email}</p>
                  <p className="meta-text text-muted-foreground">
                    Joined {format(new Date(m.created_at), "MMM d, yyyy")}{m.revoked && " · access revoked"}
                  </p>
                </div>
                {!m.revoked && <RevokeButton email={m.email} onConfirm={async (del) => { try { await revoke({ data: { userId: m.id, deleteData: del } }); toast.success(del ? "Access revoked and data deleted." : "Access revoked."); } catch (err) { toast.error(err instanceof Error ? err.message : "Could not revoke"); } reload(); }} />}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 meta-text text-muted-foreground">To restore a revoked member, add their email to the allowlist again.</p>
      </section>
    </div>
  );
}

function RevokeButton({ email, onConfirm }: { email: string; onConfirm: (deleteData: boolean) => Promise<void> }) {
  const [del, setDel] = useState(false);
  return (
    <AlertDialog onOpenChange={() => setDel(false)}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="h-12"><UserX className="h-4 w-4" /> Revoke</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke access for {email}?</AlertDialogTitle>
          <AlertDialogDescription>They'll be signed out and can no longer log in. Their data is kept unless you choose to delete it.</AlertDialogDescription>
        </AlertDialogHeader>
        <label htmlFor="revoke-delete-data" className="flex min-h-12 items-center gap-3 label-text">
          <Checkbox id="revoke-delete-data" checked={del} onCheckedChange={(v) => setDel(v === true)} />
          Revoke and delete data (permanent)
        </label>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => onConfirm(del)} className={del ? "bg-destructive text-destructive-foreground" : ""}>
            {del ? "Revoke and delete data" : "Revoke access"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
