import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { registerAccount } from "@/lib/access.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({
  validateSearch: z.object({
    revoked: z.coerce.boolean().optional(),
    setup: z.coerce.boolean().optional(),
    email: z.string().max(255).optional(),
  }),
  head: () => ({
    meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, 
      { title: "Ascent — sign in" },
      { name: "description", content: "Track what you're mastering. Keep what you learn." },
      { property: "og:title", content: "Ascent" },
      { property: "og:description", content: "Track what you're mastering. Keep what you learn." },
    ],
  }),
  component: Landing,
});

function friendly(msg: string) {
  const m = msg.toLowerCase();
  if (m.includes("invite-only") || m.includes("not been invited")) return "This email hasn't been invited yet. Ask the owner for an invite.";
  if (m.includes("already") && (m.includes("registered") || m.includes("exists"))) return "An account with this email already exists. Sign in instead.";
  if (m.includes("password") && (m.includes("8") || m.includes("short") || m.includes("least"))) return "Password must be at least 8 characters.";
  if (m.includes("weak") || m.includes("pwned") || m.includes("leaked")) return "That password is too common. Choose a different one.";
  if (m.includes("invalid") && m.includes("email")) return "Enter a valid email address.";
  if (m.includes("rate") || m.includes("too many")) return "Too many attempts. Wait a minute and try again.";
  if (m.includes("banned")) return "Your access to Ascent has ended.";
  return "Something went wrong. Try again.";
}

function Landing() {
  const navigate = useNavigate();
  const { revoked, setup, email: presetEmail } = Route.useSearch();
  const [mode, setMode] = useState<"in" | "up" | "reset">(setup ? "up" : "in");
  const [resetSent, setResetSent] = useState(false);
  const [email, setEmail] = useState(presetEmail ?? "");
  const [show, setShow] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(revoked ? "Your access to Ascent has ended." : null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      // Invite links sign the user in before they have a password; drop that session and show setup.
      if (setup) {
        if (data.user) void supabase.auth.signOut({ scope: "local" });
        return;
      }
      if (data.user && !revoked) navigate({ to: "/today", replace: true });
    });
  }, [navigate, revoked, setup]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) {
          setError(friendly(error.message));
          return;
        }
        setResetSent(true);
        return;
      }
      if (mode === "up") {
        const res = await registerAccount({ data: { email, password } });
        if (!res.ok) {
          setError(
            res.code === "not_invited" ? "This email hasn't been invited yet. Ask the owner for an invite."
            : res.code === "exists" ? "An account with this email already exists. Sign in instead."
            : friendly(res.error),
          );
          return;
        }
      }
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) {
        setError(error.message.toLowerCase().includes("banned") ? "Your access to Ascent has ended." : "Email or password is incorrect.");
        return;
      }
      navigate({ to: "/today", replace: true });
    } catch (err) {
      setError(friendly(err instanceof Error ? err.message : ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      <svg aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 w-full text-ridge" viewBox="0 0 1200 400" preserveAspectRatio="none">
        <path d="M0 400 L180 220 L300 300 L520 90 L700 260 L840 170 L1000 290 L1200 160 L1200 400 Z" fill="currentColor" opacity="0.45" />
        <path d="M0 400 L240 300 L420 340 L620 230 L820 330 L1040 260 L1200 320 L1200 400 Z" fill="currentColor" opacity="0.7" />
      </svg>
      <div className="relative w-full max-w-sm">
        <div className="mb-10 text-center">
          <img src="/icon-192.png" alt="" className="mx-auto mb-5 h-14 w-14 rounded-2xl" />
          <h1 className="text-4xl font-semibold">Ascent</h1>
          <p className="mt-2 text-muted-foreground">Track what you're mastering. Keep what you learn.</p>
        </div>
        <form onSubmit={submit} className="surface space-y-4 p-6 shadow-sm">
          {mode !== "reset" && (
            <div role="tablist" aria-label="Account" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {([["in", "Sign in"], ["up", "Set up account"]] as const).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => { setMode(m); setError(null); }}
                  className={`h-11 rounded-md text-sm font-medium transition-colors ${mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" />
          </div>
          {mode !== "reset" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {mode === "in" && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("reset");
                      setError(null);
                      setResetSent(false);
                    }}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
              <Input
                id="password"
                type={show ? "text" : "password"}
                autoComplete={mode === "up" ? "new-password" : "current-password"}
                minLength={mode === "up" ? 8 : undefined}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 pr-12"
              />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
          )}
          {error && <p className="rounded-lg bg-muted p-3 text-sm" role="alert">{error}</p>}
          {mode === "reset" && resetSent ? (
            <>
              <p className="rounded-lg bg-muted p-3 text-sm">
                If an account exists for that email, a reset link is on its way. Check your inbox.
              </p>
              <button
                type="button"
                onClick={() => {
                  setMode("in");
                  setError(null);
                  setResetSent(false);
                }}
                className="tap w-full text-sm text-muted-foreground hover:text-foreground"
              >
                Back to sign in
              </button>
            </>
          ) : (
            <>
              <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
                {busy ? "One moment…" : mode === "in" ? "Sign in" : mode === "up" ? "Create account" : "Send reset link"}
              </Button>
              {mode === "reset" && (
                <button
                  type="button"
                  onClick={() => { setMode("in"); setError(null); setResetSent(false); }}
                  className="tap w-full text-sm text-muted-foreground hover:text-foreground"
                >
                  Back to sign in
                </button>
              )}
            </>
          )}
        </form>
      </div>
    </main>
  );
}
