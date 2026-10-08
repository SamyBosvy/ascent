import { useSubmission } from "@/hooks/use-submission";
import { requireOnline } from "@/lib/sync";
import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rememberEmailChange, syncMyAllowlistEmail } from "@/lib/access.functions";
import { SectionTitle } from "@/components/app/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getRouteApi } from "@tanstack/react-router";

async function verifyPassword(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return !error;
}

function PasswordInput({ id, value, onChange, show, onToggle, autoComplete }: {
  id: string; value: string; onChange: (v: string) => void; show: boolean; onToggle?: () => void; autoComplete: string;
}) {
  return (
    <div className="relative">
      <Input id={id} type={show ? "text" : "password"} autoComplete={autoComplete} required value={value}
        onChange={(e) => onChange(e.target.value)} className={onToggle ? "h-12 pr-12" : "h-12"} />
      {onToggle && (
        <button type="button" onClick={onToggle} aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground">
          {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      )}
    </div>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AccountSection({ email: initialEmail }: { email: string }) {
  const [email, setEmail] = useState(initialEmail);
  const { user } = getRouteApi('/_authenticated').useRouteContext();
  const initialName = user.user_metadata?.['display_name'];
  const [displayName, setDisplayName] = useState(typeof initialName === 'string' ? initialName : '');
  const [nameErr, setNameErr] = useState<string | null>(null);
  const { submitting: submittingName, submit: submitName } = useSubmission();

  function changeDisplayName(e: React.FormEvent) {
    e.preventDefault();
    return submitName(async () => {
      setNameErr(null);
      if (!requireOnline('Changing your display name')) {
        setNameErr("You're offline. Changing your display name needs a connection.");
        return;
      }
      const name = displayName.trim();
      if (name.length > 50) { setNameErr('Display name must be 50 characters or fewer.'); return; }
      try {
        const { error } = await supabase.auth.updateUser({ data: { display_name: name } });
        if (error) { setNameErr(error.message); return; }
        // The root USER_UPDATED subscriber refreshes the authenticated route context.
        setDisplayName(name);
        toast.success('Display name updated.');
      } catch (err) {
        setNameErr(err instanceof Error ? err.message : 'Could not update display name.');
      }
    });
  }

  // Password form
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [conf, setConf] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  // Email form
  const [newEmail, setNewEmail] = useState("");
  const [emPw, setEmPw] = useState("");
  const [showEm, setShowEm] = useState(false);
  const [emErr, setEmErr] = useState<string | null>(null);
  const [emMsg, setEmMsg] = useState<string | null>(null);
  const [emBusy, setEmBusy] = useState(false);
  const synced = useRef(false);

  // Detect a confirmed email change (on return from the link, or USER_UPDATED).
  useEffect(() => {
    async function check() {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      if (!u) return;
      setEmail(u.email ?? "");
      const prev = (u.app_metadata as { prev_email?: string })?.prev_email;
      if (synced.current || !prev || !u.email || prev === u.email.toLowerCase()) return;
      synced.current = true;
      try {
        const r = await syncMyAllowlistEmail();
        if (r.changed) toast.success("Email updated");
      } catch {
        synced.current = false;
      }
    }
    check();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "USER_UPDATED" || event === "SIGNED_IN") setTimeout(check, 0);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const { submitting: submittingPassword, submit: submitPassword } = useSubmission();
  function changePassword(e: React.FormEvent) { e.preventDefault(); return submitPassword(() => changePasswordRequest(e)); }
  async function changePasswordRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!requireOnline("Changing your password")) return;
    setPwErr(null);
    if (next.length < 8) return setPwErr("New password must be at least 8 characters.");
    if (next !== conf) return setPwErr("New passwords don't match.");
    if (next === cur) return setPwErr("New password must be different from the current one.");
    setPwBusy(true);
    try {
      if (!(await verifyPassword(email, cur))) return setPwErr("Current password is incorrect.");
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) return setPwErr(error.message);
      toast.success("Password updated");
      setCur(""); setNext(""); setConf("");
    } finally {
      setPwBusy(false);
    }
  }

  const { submitting: submittingEmail, submit: submitEmail } = useSubmission();
  function changeEmail(e: React.FormEvent) { e.preventDefault(); return submitEmail(() => changeEmailRequest(e)); }
  async function changeEmailRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!requireOnline("Changing your email")) return;
    setEmErr(null);
    setEmMsg(null);
    const target = newEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(target) || target.length > 255) return setEmErr("Enter a valid email address.");
    if (target === email.toLowerCase()) return setEmErr("That's already your email.");
    setEmBusy(true);
    try {
      if (!(await verifyPassword(email, emPw))) return setEmErr("Current password is incorrect.");
      await rememberEmailChange();
      const { data, error } = await supabase.auth.updateUser(
        { email: target },
        { emailRedirectTo: `${window.location.origin}/settings` },
      );
      if (error) return setEmErr(error.message);
      // With secure email change on, Supabase keeps new_email pending and mails both addresses.
      const both = !!data.user?.new_email && data.user.email?.toLowerCase() === email.toLowerCase();
      setEmMsg(
        both
          ? "Check both your old and new inbox. We've sent a confirmation link to each. Your email won't change until you confirm it."
          : "Check your inbox. We've sent a confirmation link. Your email won't change until you confirm it.",
      );
      setNewEmail(""); setEmPw("");
    } catch (err) {
      setEmErr(err instanceof Error ? err.message : "Could not change email.");
    } finally {
      setEmBusy(false);
    }
  }

  return (
    <section>
      <SectionTitle>Account</SectionTitle>
      <div className="space-y-4">
        <form onSubmit={changeDisplayName} className="surface space-y-4 p-4">
          <div className="space-y-2">
            <Label htmlFor="display-name">Display name</Label>
            <Input id="display-name" autoComplete="nickname" maxLength={50} value={displayName}
              disabled={submittingName} aria-invalid={!!nameErr} aria-describedby={nameErr ? 'display-name-error' : undefined}
              onChange={(e) => setDisplayName(e.target.value)} className="h-12" />
          </div>
          {nameErr && <p id="display-name-error" className="rounded-lg bg-muted p-3 text-sm" role="alert">{nameErr}</p>}
          <Button type="submit" className="h-12 w-full" disabled={submittingName}>{submittingName ? 'Saving…' : 'Save display name'}</Button>
        </form>
        <form onSubmit={changePassword} className="surface space-y-4 p-4">
          <h3 className="font-medium">Change password</h3>
          <div className="space-y-2">
            <Label htmlFor="cur-pw">Current password</Label>
            <PasswordInput id="cur-pw" value={cur} onChange={setCur} show={showPw} onToggle={() => setShowPw((s) => !s)} autoComplete="current-password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-pw">New password</Label>
            <PasswordInput id="new-pw" value={next} onChange={setNext} show={showPw} autoComplete="new-password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="conf-pw">Confirm new password</Label>
            <PasswordInput id="conf-pw" value={conf} onChange={setConf} show={showPw} autoComplete="new-password" />
          </div>
          {pwErr && <p className="rounded-lg bg-muted p-3 text-sm" role="alert">{pwErr}</p>}
          <Button type="submit" className="h-12 w-full" disabled={pwBusy || submittingPassword}>{pwBusy ? "Saving…" : "Update password"}</Button>
        </form>

        <form onSubmit={changeEmail} className="surface space-y-4 p-4">
          <h3 className="font-medium">Change email</h3>
          <p className="text-sm text-muted-foreground">Current email: <span className="text-foreground">{email}</span></p>
          <div className="space-y-2">
            <Label htmlFor="new-email">New email</Label>
            <Input id="new-email" type="email" autoComplete="email" required maxLength={255} value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)} className="h-12" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="em-pw">Current password</Label>
            <PasswordInput id="em-pw" value={emPw} onChange={setEmPw} show={showEm} onToggle={() => setShowEm((s) => !s)} autoComplete="current-password" />
          </div>
          {emErr && <p className="rounded-lg bg-muted p-3 text-sm" role="alert">{emErr}</p>}
          {emMsg && <p className="rounded-lg bg-muted p-3 text-sm" role="status">{emMsg}</p>}
          <Button type="submit" className="h-12 w-full" disabled={emBusy || submittingEmail}>{emBusy ? "Sending…" : "Change email"}</Button>
        </form>
      </div>
    </section>
  );
}
