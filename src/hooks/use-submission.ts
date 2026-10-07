import { useRef, useState } from "react";
import { toast } from "sonner";

/** Synchronous lock: even two submissions before React renders share one request. */
export function useSubmission() {
  const locked = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  async function submit<T>(action: () => Promise<T>): Promise<T | undefined> {
    if (locked.current) return undefined;
    locked.current = true;
    setSubmitting(true);
    try {
      return await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save. Please try again.");
      return undefined;
    } finally {
      locked.current = false;
      setSubmitting(false);
    }
  }
  return { submitting, submit };
}