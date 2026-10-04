import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { registerAccount } from "@/lib/access.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({
  validateSearch: z.object({ revoked: z.coerce.boolean().optional() }),
  head: () => ({
    meta: [
      { title: "Ascent — sign in" },
      { name: "description", content: "Track what you're mastering. Keep what you learn." },
      { property: "og:title", content: "Ascent" },
      { property: "og:description", content: "Track what you're mastering. Keep what you learn." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const { revoked } = Route.useSearch();
  const [mode, setMode] = useState<"in" | "up" | "reset">("in");
  const [resetSent, setResetSent] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(revoked ? "Your access to Ascent has ended." : null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user && !revoked) navigate({ to: "/today", replace: true });
    });
  }, [navigate, revoked]);

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
          setError(error.message);
          return;
        }
        setResetSent(true);
        return;
      }
      if (mode === "up") {
        const res = await registerAccount({ data: { email, password } });
        if (!res.ok) {
          setError(res.error);
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
      setError(err instanceof Error ? err.message : "Something went wrong.");
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
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "up" ? "new-password" : "current-password"}
              minLength={mode === "up" ? 8 : undefined}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12"
            />
          </div>
          {error && <p className="rounded-lg bg-muted p-3 text-sm" role="alert">{error}</p>}
          <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
            {busy ? "One moment…" : mode === "in" ? "Sign in" : "Create account"}
          </Button>
          <button
            type="button"
            onClick={() => {
              setMode(mode === "in" ? "up" : "in");
              setError(null);
            }}
            className="tap w-full text-sm text-muted-foreground hover:text-foreground"
          >
            {mode === "in" ? "Invited? Set up your account" : "Already have an account? Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
