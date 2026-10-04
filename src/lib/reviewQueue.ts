import { supabase } from "@/integrations/supabase/client";

// Every rating is persisted to localStorage *before* it is sent, and removed only once the
// database confirms it. record_review is idempotent on review id, so re-sending is safe.
const KEY = "ascent:pending-reviews";

export type PendingReview = {
  id: string;
  card_id: string;
  rating: number;
  ease: number;
  interval_days: number;
  due_at: string;
  reps: number;
  reviewed_at: string;
};

function read(): PendingReview[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as PendingReview[];
  } catch {
    return [];
  }
}
function write(list: PendingReview[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}
function remove(id: string) {
  write(read().filter((p) => p.id !== id));
}

async function send(p: PendingReview) {
  const { error } = await supabase.rpc("record_review", {
    _review_id: p.id,
    _card_id: p.card_id,
    _rating: p.rating,
    _ease: p.ease,
    _interval_days: p.interval_days,
    _due_at: p.due_at,
    _reps: p.reps,
    _reviewed_at: p.reviewed_at,
  });
  if (!error) return "ok" as const;
  // Card was deleted: nothing left to save, drop it.
  if (error.code === "P0002") return "gone" as const;
  throw new Error(error.message);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Queue + send with 3 attempts and backoff. Resolves true when saved, false when left in the queue (or cancelled). */
export async function saveReview(p: PendingReview, signal?: { cancelled: boolean }): Promise<boolean> {
  write([...read().filter((x) => x.id !== p.id), p]);
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.cancelled) return false;
    try {
      await send(p);
      remove(p.id);
      return true;
    } catch {
      if (attempt < 2) await sleep(500 * 2 ** attempt);
    }
  }
  return false;
}

let flushing = false;
/** Retry everything left over from earlier. Returns how many were saved. */
export async function flushPendingReviews(): Promise<number> {
  if (flushing || typeof localStorage === "undefined") return 0;
  flushing = true;
  let saved = 0;
  try {
    for (const p of read()) {
      if (!read().some((x) => x.id === p.id)) continue; // undone meanwhile
      try {
        const r = await send(p);
        remove(p.id);
        if (r === "ok") saved++;
      } catch {
        // still offline / failing — keep it for next time
      }
    }
  } finally {
    flushing = false;
  }
  return saved;
}

export const hasPendingReviews = () => read().length > 0;

/** Drop a rating that hasn't reached the server yet. Returns true if it was still queued. */
export function cancelPendingReview(id: string) {
  const had = read().some((p) => p.id === id);
  remove(id);
  return had;
}

/**
 * Undo a rating. Stops any retries, waits for an in-flight send to settle, removes it from the
 * local queue, then calls the idempotent undo_review RPC (a no-op if the review never landed).
 */
export async function undoReview(
  p: PendingReview,
  prev: { ease: number; interval_days: number; due_at: string; reps: number },
  inflight: { signal: { cancelled: boolean }; promise: Promise<boolean> },
) {
  inflight.signal.cancelled = true;
  cancelPendingReview(p.id);
  const landed = await inflight.promise.catch(() => false);
  cancelPendingReview(p.id);
  const { error } = await supabase.rpc("undo_review", {
    _review_id: p.id,
    _card_id: p.card_id,
    _ease: prev.ease,
    _interval_days: prev.interval_days,
    _due_at: prev.due_at,
    _reps: prev.reps,
  });
  // If it never reached the server there's nothing to revert there; only a confirmed save must be undone.
  if (error && landed) throw new Error(error.message);
}
