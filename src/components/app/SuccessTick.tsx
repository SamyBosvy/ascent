import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { haptic } from "@/lib/feedback";
import { cn } from "@/lib/utils";

export function SuccessTick({ className }: { className?: string }) {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className={cn("size-4 shrink-0", className)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path className="success-tick" pathLength="1" d="m5 12 4 4 10-10" /></svg>;
}

/** Keep the existing accessible toast text; replace only its decorative icon. */
export function successFeedback(message: string) {
  haptic("success");
  toast.success(message, { icon: <SuccessTick /> });
}

export function useSuccessTick() {
  const [active, setActive] = useState<string | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timeout.current) clearTimeout(timeout.current); }, []);
  function show(id: string) {
    if (timeout.current) clearTimeout(timeout.current);
    setActive(id);
    timeout.current = setTimeout(() => setActive(null), 900);
  }
  return { active, show };
}