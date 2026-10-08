import { cancel, enqueue, flush, flushWithRetry, isQueued } from "./outbox";

// Ratings go through the durable outbox (IndexedDB): persisted before sending, removed only once
// the database confirms them. record_review / undo_review are idempotent on the review id.

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

/** Queue + try to send. Resolves true when saved, false when it is still waiting in the outbox. */
export async function saveReview(p: PendingReview, signal?: { cancelled: boolean }): Promise<boolean> {
  await enqueue({ kind: "review", data: p }, p.id);
  if (signal?.cancelled) return false;
  await flush();
  const saved = !(await isQueued(p.id));
  if (!saved) void flushWithRetry();
  return saved;
}

/**
 * Undo a rating. If it never left the outbox it is simply removed; otherwise an idempotent
 * undo_review is queued behind it (and sent at once when online).
 */
export async function undoReview(
  p: PendingReview,
  prev: { ease: number; interval_days: number; due_at: string; reps: number },
  inflight: { signal: { cancelled: boolean }; promise: Promise<boolean> },
) {
  inflight.signal.cancelled = true;
  await inflight.promise.catch(() => false);
  if (await cancel(p.id)) return;
  await enqueue({ kind: "undo_review", data: { review_id: p.id, card_id: p.card_id, ...prev } }, `undo:${p.id}`);
  await flushWithRetry();
}
