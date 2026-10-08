import { get as idbGet, set as idbSet } from "idb-keyval";

/**
 * One durable outbox for every offline-capable write. Items are persisted (IndexedDB) before they
 * are sent and removed only once the server confirms them. Every item carries a client-generated
 * id and every operation is idempotent (record_review/undo_review on review id, inserts with a
 * client id or unique key where a duplicate counts as success, updates that set absolute values),
 * so a replay after a lost response never double-counts.
 */

export type ReviewPayload = {
  id: string; card_id: string; rating: number; ease: number; interval_days: number; due_at: string; reps: number; reviewed_at: string;
};
export type UndoPayload = { review_id: string; card_id: string; ease: number; interval_days: number; due_at: string; reps: number };

export type OutboxOp =
  | { kind: "review"; data: ReviewPayload }
  | { kind: "undo_review"; data: UndoPayload }
  | { kind: "checkin_add"; data: { route_id: string; checked_on: string } }
  | { kind: "checkin_del"; data: { route_id: string; checked_on: string } }
  | { kind: "session_add"; data: { id: string; route_id: string; minutes: number; note: string | null; logged_at: string } }
  | { kind: "milestone"; data: { id: string; done: boolean; done_at: string | null } }
  | { kind: "pages"; data: { route_id: string; current_page: number } };

export type OutboxItem = OutboxOp & { id: string; user_id: string; created_at: string; attempts: number };

/** "ok" = applied (or already applied), "drop" = can never succeed, "retry" = try again later. */
export type SendResult = "ok" | "drop" | "retry" | { status: "drop"; reason: string };
export type Sender = (item: OutboxItem) => Promise<SendResult>;

export type Storage = { get: () => Promise<OutboxItem[]>; set: (items: OutboxItem[]) => Promise<void> };

const KEY = "ascent:outbox";
const LEGACY_KEY = "ascent:pending-reviews";

let storage: Storage = {
  get: async () => ((await idbGet(KEY)) as OutboxItem[] | undefined) ?? [],
  set: (items) => idbSet(KEY, items),
};
let sender: Sender | null = null;
let currentUser: string | null = null;
let onDropped: (item: OutboxItem, reason: string) => void = () => {};
let onSynced: (n: number) => void = () => {};

export function configureOutbox(opts: { storage?: Storage; sender?: Sender; onDropped?: typeof onDropped; onSynced?: typeof onSynced }) {
  if (opts.storage) storage = opts.storage;
  if (opts.sender) sender = opts.sender;
  if (opts.onDropped) onDropped = opts.onDropped;
  if (opts.onSynced) onSynced = opts.onSynced;
}
export function setOutboxUser(userId: string | null) {
  currentUser = userId;
  void notify();
}

// ---- serialised storage access (no lost updates between concurrent writers) ----
let chain: Promise<unknown> = Promise.resolve();
function locked<R>(fn: () => Promise<R>): Promise<R> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}
const mutate = (fn: (items: OutboxItem[]) => OutboxItem[]) => locked(async () => { const next = fn(await storage.get()); await storage.set(next); void notify(next); return next; });

// ---- pending count subscription ----
const listeners = new Set<(n: number) => void>();
let lastCount = 0;
async function notify(items?: OutboxItem[]) {
  const list = items ?? (await storage.get().catch(() => []));
  lastCount = list.filter((i) => i.user_id === currentUser).length;
  listeners.forEach((l) => l(lastCount));
}
export function subscribePending(l: (n: number) => void) {
  listeners.add(l);
  l(lastCount);
  return () => { listeners.delete(l); };
}
export const pendingCount = () => lastCount;

export async function listOutbox() {
  return storage.get();
}

/** Add an operation. Returns the stored item. */
export async function enqueue(op: OutboxOp, id: string = crypto.randomUUID()): Promise<OutboxItem> {
  if (!currentUser) throw new Error("Not signed in");
  const item = { ...op, id, user_id: currentUser, created_at: new Date().toISOString(), attempts: 0 } as OutboxItem;
  await mutate((items) => [...items.filter((i) => i.id !== id), item]);
  return item;
}

/** Remove a not-yet-sent item. Waits for an in-flight flush first, so the answer is final. Returns true if it was still queued. */
export async function cancel(id: string): Promise<boolean> {
  await flushing;
  let had = false;
  await mutate((items) => { had = items.some((i) => i.id === id); return items.filter((i) => i.id !== id); });
  return had;
}
export async function isQueued(id: string) {
  return (await storage.get()).some((i) => i.id === id);
}

let flushing: Promise<number> = Promise.resolve(0);
let running = false;
/**
 * Send this user's items in order. Stops at the first transient failure (order is preserved),
 * drops permanent failures. Returns how many were applied.
 */
export function flush(): Promise<number> {
  if (running) return flushing;
  running = true;
  flushing = (async () => {
    let applied = 0;
    try {
      if (!sender || !currentUser) return 0;
      for (;;) {
        const items = await storage.get();
        const next = items.find((i) => i.user_id === currentUser);
        if (!next) break;
        let res: SendResult;
        let reason = "";
        try {
          res = await sender(next);
        } catch (e) {
          res = "retry";
          reason = e instanceof Error ? e.message : String(e);
        }
        if (typeof res === "object") reason = res.reason;
        const status = typeof res === "object" ? res.status : res;
        if (status === "retry") {
          await mutate((list) => list.map((i) => (i.id === next.id ? { ...i, attempts: i.attempts + 1 } : i)));
          break;
        }
        await mutate((list) => list.filter((i) => i.id !== next.id));
        if (status === "ok") applied++;
        else onDropped(next, reason);
      }
    } finally {
      running = false;
    }
    if (applied) onSynced(applied);
    return applied;
  })();
  return flushing;
}

// ---- retry with backoff ----
let timer: ReturnType<typeof setTimeout> | null = null;
let backoff = 1000;
/** Flush now; if something is left (and we're online), retry with exponential backoff up to 60s. */
export async function flushWithRetry() {
  if (timer) { clearTimeout(timer); timer = null; }
  await flush();
  const left = (await storage.get()).some((i) => i.user_id === currentUser);
  if (!left) { backoff = 1000; return; }
  if (typeof navigator !== "undefined" && !navigator.onLine) return; // the "online" event restarts it
  timer = setTimeout(() => void flushWithRetry(), backoff);
  backoff = Math.min(backoff * 2, 60000);
}

/** Move ratings left in the old localStorage review queue into the outbox (once). */
export async function migrateLegacyReviewQueue(ls: Pick<globalThis.Storage, "getItem" | "removeItem"> | undefined = globalThis.localStorage) {
  if (!ls || !currentUser) return 0;
  let old: ReviewPayload[] = [];
  try { old = JSON.parse(ls.getItem(LEGACY_KEY) ?? "[]") as ReviewPayload[]; } catch { old = []; }
  if (!Array.isArray(old) || old.length === 0) { ls.removeItem(LEGACY_KEY); return 0; }
  const user = currentUser;
  await mutate((items) => {
    const have = new Set(items.map((i) => i.id));
    const add = old.filter((p) => p && typeof p.id === "string" && !have.has(p.id)).map((p): OutboxItem => ({ kind: "review", data: p, id: p.id, user_id: user, created_at: p.reviewed_at ?? new Date().toISOString(), attempts: 0 }));
    return [...items, ...add];
  });
  ls.removeItem(LEGACY_KEY);
  return old.length;
}

/** Classify a database error: duplicates count as already applied; network errors are transient. */
export function classify(error: { code?: string; message?: string } | null, isInsert = false): SendResult {
  if (!error) return "ok";
  if (isInsert && error.code === "23505") return "ok";
  // Missing parent / row, bad input, permission or check failures will never succeed on replay.
  if (error.code && /^(23503|23514|22P02|22023|P0002|42501|PGRST116)$/.test(error.code)) return "drop";
  return "retry";
}

/** Preserve permanent failure categories all the way to the drop toast. */
export function dropReason(code?: string): string {
  if (code === "42501") return "you no longer have access";
  if (code && /^(23514|22P02|22023)$/.test(code)) return "it was rejected as invalid";
  if (code && /^(23503|P0002|PGRST116)$/.test(code)) return "its route or card no longer exists";
  return "it could not be applied";
}
export function classifyResult(error: { code?: string; message?: string } | null, isInsert = false): SendResult {
  const status = classify(error, isInsert);
  return status === "drop" ? { status, reason: dropReason(error?.code) } : status;
}
