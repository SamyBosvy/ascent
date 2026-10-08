import { useEffect, useState, useSyncExternalStore } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { classify, configureOutbox, enqueue, flushWithRetry, migrateLegacyReviewQueue, setOutboxUser, subscribePending, type OutboxItem, type OutboxOp, type SendResult } from "./outbox";

async function send(item: OutboxItem): Promise<SendResult> {
  switch (item.kind) {
    case "review": {
      const p = item.data;
      const { error } = await supabase.rpc("record_review", {
        _review_id: p.id, _card_id: p.card_id, _rating: p.rating, _ease: p.ease, _interval_days: p.interval_days, _due_at: p.due_at, _reps: p.reps, _reviewed_at: p.reviewed_at,
      });
      return classify(error);
    }
    case "undo_review": {
      const p = item.data;
      const { error } = await supabase.rpc("undo_review", { _review_id: p.review_id, _card_id: p.card_id, _ease: p.ease, _interval_days: p.interval_days, _due_at: p.due_at, _reps: p.reps });
      return classify(error);
    }
    case "checkin_add": {
      const { error } = await supabase.from("checkins").insert(item.data);
      return classify(error, true);
    }
    case "checkin_del": {
      const { error } = await supabase.from("checkins").delete().eq("route_id", item.data.route_id).eq("checked_on", item.data.checked_on);
      return classify(error);
    }
    case "session_add": {
      const { error } = await supabase.from("sessions").insert(item.data);
      return classify(error, true);
    }
    case "milestone": {
      const { error } = await supabase.from("milestones").update({ done: item.data.done, done_at: item.data.done_at }).eq("id", item.data.id);
      return classify(error);
    }
    case "pages": {
      const { error } = await supabase.from("routes").update({ current_page: item.data.current_page }).eq("id", item.data.route_id);
      return classify(error);
    }
  }
}

const LABEL: Record<OutboxItem["kind"], string> = {
  review: "a rating", undo_review: "an undo", checkin_add: "a check-in", checkin_del: "a check-in removal", session_add: "a session", milestone: "a milestone change", pages: "a page update",
};

let qc: QueryClient | null = null;
/** Wire the outbox to the database and the query cache. Called once by the signed-in shell. */
export async function startSync(queryClient: QueryClient, userId: string) {
  qc = queryClient;
  configureOutbox({
    sender: send,
    onDropped: (item) => toast.error(`Couldn't sync ${LABEL[item.kind]} — its route or card no longer exists.`),
    onSynced: () => void queryClient.invalidateQueries(),
  });
  setOutboxUser(userId);
  await migrateLegacyReviewQueue();
  void flushWithRetry();
}
export function stopSync() {
  setOutboxUser(null);
}

/** Queue a write and try to send it right away; resolves once queued (the UI updates optimistically). */
export async function queueWrite(op: OutboxOp, id?: string) {
  const item = await enqueue(op, id);
  void flushWithRetry();
  return item;
}
export const syncNow = () => flushWithRetry();
export const queryClientForSync = () => qc;

export function usePendingCount() {
  const [n, setN] = useState(0);
  useEffect(() => subscribePending(setN), []);
  return n;
}

const onlineSub = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); };
};
/** Browser connection state (true during SSR). */
export function useOnline() {
  return useSyncExternalStore(onlineSub, () => navigator.onLine, () => true);
}
export const isOffline = () => typeof navigator !== "undefined" && !navigator.onLine;

/** For actions that need the server: shows a clear message and returns false while offline. */
export function requireOnline(what = "This") {
  if (!isOffline()) return true;
  toast.error(`You're offline. ${what} needs a connection — try again when you're back online.`);
  return false;
}
