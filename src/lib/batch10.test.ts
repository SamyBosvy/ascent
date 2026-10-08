import { beforeEach, describe, expect, it } from "vitest";
import { classify, configureOutbox, enqueue, flush, cancel, listOutbox, migrateLegacyReviewQueue, setOutboxUser, type OutboxItem, type SendResult } from "./outbox";
import { batchPayloads, parseBackup, planImport, payloadRows, type RoutePayload } from "./backup";

// ---------- outbox ----------
let mem: OutboxItem[] = [];
let results: SendResult[] = [];
const sent: string[] = [];
const dropped: string[] = [];
beforeEach(() => {
  mem = [];
  results = [];
  sent.length = 0;
  dropped.length = 0;
  configureOutbox({
    storage: { get: async () => mem.map((i) => ({ ...i })), set: async (v) => { mem = v; } },
    sender: async (i) => { sent.push(i.id); return results.shift() ?? "ok"; },
    onDropped: (i) => dropped.push(i.id),
    onSynced: () => {},
  });
  setOutboxUser("u1");
});
const session = (id: string) => ({ kind: "session_add" as const, data: { id, route_id: "r", minutes: 5, note: null, logged_at: "2026-10-01T00:00:00Z" } });

describe("outbox", () => {
  it("sends items in order and removes them once confirmed", async () => {
    await enqueue(session("a"), "a");
    await enqueue(session("b"), "b");
    expect(await flush()).toBe(2);
    expect(sent).toEqual(["a", "b"]);
    expect(mem).toEqual([]);
  });
  it("stops at a transient failure and keeps order for the retry", async () => {
    await enqueue(session("a"), "a");
    await enqueue(session("b"), "b");
    results = ["retry"];
    expect(await flush()).toBe(0);
    expect(mem.map((i) => i.id)).toEqual(["a", "b"]);
    expect(mem[0]!.attempts).toBe(1);
    expect(await flush()).toBe(2);
    expect(sent).toEqual(["a", "a", "b"]);
  });
  it("drops permanent failures and continues", async () => {
    await enqueue(session("a"), "a");
    await enqueue(session("b"), "b");
    results = ["drop", "ok"];
    expect(await flush()).toBe(1);
    expect(dropped).toEqual(["a"]);
    expect(mem).toEqual([]);
  });
  it("treats a thrown network error as transient", async () => {
    configureOutbox({ sender: async () => { throw new TypeError("Failed to fetch"); } });
    await enqueue(session("a"), "a");
    await flush();
    expect(mem).toHaveLength(1);
  });
  it("re-enqueueing the same id replaces it (one item per client id)", async () => {
    await enqueue(session("a"), "a");
    await enqueue(session("a"), "a");
    expect(mem).toHaveLength(1);
  });
  it("only sends the signed-in user's items", async () => {
    await enqueue(session("a"), "a");
    setOutboxUser("u2");
    expect(await flush()).toBe(0);
    expect(mem).toHaveLength(1);
  });
  it("cancel removes a queued item and reports whether it was still queued", async () => {
    await enqueue(session("a"), "a");
    expect(await cancel("a")).toBe(true);
    expect(await cancel("a")).toBe(false);
    expect(await listOutbox()).toEqual([]);
  });
  it("migrates the legacy localStorage review queue once", async () => {
    const store: Record<string, string> = { "ascent:pending-reviews": JSON.stringify([{ id: "rv1", card_id: "c", rating: 2, ease: 2.5, interval_days: 1, due_at: "x", reps: 1, reviewed_at: "2026-10-01T00:00:00Z" }]) };
    const ls = { getItem: (k: string) => store[k] ?? null, removeItem: (k: string) => { delete store[k]; } };
    expect(await migrateLegacyReviewQueue(ls)).toBe(1);
    expect(mem.map((i) => [i.kind, i.id])).toEqual([["review", "rv1"]]);
    expect(store["ascent:pending-reviews"]).toBeUndefined();
    expect(await migrateLegacyReviewQueue(ls)).toBe(0);
  });
  it("classifies database errors", () => {
    expect(classify(null)).toBe("ok");
    expect(classify({ code: "23505" }, true)).toBe("ok");
    expect(classify({ code: "23505" })).toBe("retry");
    expect(classify({ code: "23503" })).toBe("drop");
    expect(classify({ code: "P0002" })).toBe("drop");
    expect(classify({ code: "22P02" })).toBe("drop");
    expect(classify({ message: "Failed to fetch" })).toBe("retry");
  });
});

// ---------- backup ----------
const R1 = "11111111-1111-4111-8111-111111111111";
const R2 = "22222222-2222-4222-8222-222222222222";
const C1 = "33333333-3333-4333-8333-333333333333";
const MISSING = "44444444-4444-4444-8444-444444444444";
const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const T = "2026-09-01T10:00:00.000Z";
const file = (patch: Record<string, unknown> = {}) =>
  JSON.stringify({
    version: 1,
    exported_at: T,
    routes: [
      { id: R1, user_id: "someone", name: "Spanish", type: "language", status: "active", created_at: T },
      { id: R2, name: "Rust", type: "skill", status: "summited", summited_at: T, created_at: T },
    ],
    milestones: [{ id: u(1), route_id: R2, title: "Ownership", position: 0, done: true, done_at: T }],
    sessions: [{ id: u(2), route_id: R2, minutes: 30, note: null, logged_at: T }, { id: u(3), route_id: MISSING, minutes: 5, logged_at: T }],
    cards: [{ id: C1, route_id: R1, front: "hola", back: "hello", ease: 2.6, interval_days: 4, reps: 2, due_at: T, last_reviewed_at: T }],
    reviews: [{ id: u(4), card_id: C1, route_id: R1, rating: 2, reviewed_at: T }, { id: u(5), card_id: MISSING, route_id: R1, rating: 1, reviewed_at: T }],
    checkins: [],
    notes: [{ id: u(6), route_id: R1, title: "Verbs", body: "ser/estar", tags: ["grammar"], created_at: T }],
    ...patch,
  });
let n = 0;
const ids = () => `new-${++n}`;

describe("backup validation", () => {
  it("rejects non-JSON and foreign JSON", () => {
    expect(() => parseBackup("nope")).toThrow(/valid JSON/);
    expect(() => parseBackup(JSON.stringify({ hello: 1 }))).toThrow(/Ascent backup/);
  });
  it("rejects an unknown format version", () => {
    expect(() => parseBackup(file({ version: 9 }))).toThrow(/newer version/);
  });
  it("accepts legacy exports without a version", () => {
    const f = JSON.parse(file());
    delete f.version;
    expect(parseBackup(JSON.stringify(f)).rows.routes).toHaveLength(2);
  });
  it("counts bad rows as invalid instead of failing the file", () => {
    const b = parseBackup(file({ cards: [{ id: "not-a-uuid", route_id: R1 }] }));
    expect(b.invalid.cards).toBe(1);
    expect(b.rows.cards).toHaveLength(0);
  });
});

describe("planImport", () => {
  beforeEach(() => { n = 0; });
  it("gives every row a new id and remaps all references, keeping timestamps", () => {
    const plan = planImport(parseBackup(file()), [], "skip", ids);
    const all = JSON.stringify(plan.payloads);
    for (const old of [R1, R2, C1, u(1), u(2), u(4), u(6)]) expect(all).not.toContain(old);
    expect(all).not.toContain("someone");
    const spanish = plan.payloads.find((p) => p.route.name === "Spanish")!;
    expect(spanish.cards[0]!.route_id).toBe(spanish.route.id);
    expect(spanish.reviews[0]!.card_id).toBe(spanish.cards[0]!.id);
    expect(spanish.reviews[0]!.route_id).toBe(spanish.route.id);
    expect(spanish.notes[0]!.route_id).toBe(spanish.route.id);
    expect(spanish.cards[0]!.due_at).toBe(T);
    expect(spanish.reviews[0]!.reviewed_at).toBe(T);
    const rust = plan.payloads.find((p) => p.route.name === "Rust")!;
    expect(rust.route.summited_at).toBe(T);
    expect(rust.milestones[0]!).toMatchObject({ route_id: rust.route.id, done: true, done_at: T });
  });
  it("skips rows whose parent is missing and counts them", () => {
    const plan = planImport(parseBackup(file()), [], "skip", ids);
    expect(plan.skipped.sessions).toBe(1);
    expect(plan.skipped.reviews).toBe(1);
    expect(plan.toImport).toMatchObject({ routes: 2, sessions: 1, cards: 1, reviews: 1, notes: 1, milestones: 1 });
  });
  it("skips duplicate routes and their children by default", () => {
    const plan = planImport(parseBackup(file()), [{ name: "spanish ", type: "language" }], "skip", ids);
    expect(plan.duplicates).toBe(1);
    expect(plan.payloads.map((p) => p.route.name)).toEqual(["Rust"]);
    expect(plan.skipped).toMatchObject({ routes: 1, cards: 1, reviews: 2, notes: 1 });
  });
  it("imports duplicates as copies when asked", () => {
    const plan = planImport(parseBackup(file()), [{ name: "Spanish", type: "language" }], "copy", ids);
    expect(plan.payloads.map((p) => p.route.name).sort()).toEqual(["Rust", "Spanish (copy)"]);
  });
  it("same name but a different type is not a duplicate", () => {
    expect(planImport(parseBackup(file()), [{ name: "Spanish", type: "book" }], "skip", ids).duplicates).toBe(0);
  });
  it("skips soft-deleted routes", () => {
    const b = parseBackup(file({ routes: [{ id: R1, name: "Gone", type: "skill", deleted_at: T }] }));
    expect(planImport(b, [], "skip", ids).payloads).toHaveLength(0);
  });
  it("batches routes by ~500 rows without splitting a route", () => {
    const plan = planImport(parseBackup(file()), [], "skip", ids);
    const [a, b] = plan.payloads as [RoutePayload, RoutePayload];
    const rust = a.sessions.length ? a : b;
    const big: RoutePayload = { ...a, sessions: Array.from({ length: 600 }, (_, i) => ({ ...rust.sessions[0]!, id: `s${i}` })) };
    const batches = batchPayloads([b, big, b], 500);
    expect(batches.map((b) => b.length)).toEqual([1, 1, 1]);
    expect(payloadRows(big)).toBeGreaterThan(500);
  });
});

