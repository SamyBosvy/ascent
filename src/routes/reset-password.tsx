import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Ascent — reset password" },
      { name: "description", content: "Choose a new password for your Ascent account." },
      { property: "og:title", content: "Ascent — reset password" },
      { property: "og:description", content: "Choose a new password for your Ascent account." },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [state, setState] = useState<"checking" | "ready" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setState("ready");
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState((s) => (s === "ready" ? s : session ? "ready" : "invalid"));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError(error.message);
        return;
      }
      toast.success("Password updated");
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
          <p className="mt-2 text-muted-foreground">Choose a new password.</p>
        </div>
        <div className="surface p-6 shadow-sm">
          {state === "checking" && <p className="text-center text-sm text-muted-foreground">Checking your reset link…</p>}
          {state === "invalid" && (
            <div className="space-y-4 text-center">
              <p className="rounded-lg bg-muted p-3 text-sm" role="alert">
                This reset link is invalid or has expired.
              </p>
              <Link to="/" className="tap inline-flex w-full items-center justify-center rounded-xl bg-primary px-5 text-primary-foreground">
                Back to sign in
              </Link>
            </div>
          )}
          {state === "ready" && (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={show ? "text" : "password"}
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    aria-label={show ? "Hide password" : "Show password"}
                    className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
                  >
                    {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="h-12"
                />
              </div>
              {error && <p className="rounded-lg bg-muted p-3 text-sm" role="alert">{error}</p>}
              <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
                {busy ? "One moment…" : "Update password"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
