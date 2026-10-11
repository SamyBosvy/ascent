import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/motion";

/** Initial values are painted at their final size; only subsequent changes transition. */
export function useProgressFeedback() {
  const [mounted, setMounted] = useState(false);
  const reduced = usePrefersReducedMotion();
  useEffect(() => { setMounted(true); }, []);
  return mounted && !reduced ? "progress-feedback" : "";
}