import { beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
vi.mock("@block65/webcrypto-web-push", () => ({ buildPushPayload: vi.fn().mockResolvedValue({ method: "POST", body: "encrypted" }) }));
import { sendHabitReminders } from "./sendHabitReminders";

const routes = [{ id: "r", user_id: "u", name: "Private habit", type: "habit", status: "active", reminder_enabled: true, reminder_time: "19:00:00", habit_frequency: "daily", archived_at: null, deleted_at: null }];
const subscription = { id: "s", user_id: "u", endpoint: "https://fcm.googleapis.com/send/test", p256dh: "test", auth: "test", failure_count: 0 };
function database(failureCount = 0, duplicate = false) {
  const writes: { table: string; kind: string; value?: unknown }[] = [];
  const db = { from: (table: string) => {
    let kind = "read";
    const query = {
      select: () => query, eq: () => query, is: () => query, gte: () => query, lte: () => query, order: () => query,
      range: async () => ({ data: table === "routes" ? routes : [{ ...subscription, failure_count: failureCount }], error: null }),
      maybeSingle: async () => ({ data: { timezone: "Australia/Sydney", week_start: 1 }, error: null }),
      insert: (value: unknown) => { kind = "insert"; writes.push({ table, kind, value }); return query; },
      update: (value: unknown) => { kind = "update"; writes.push({ table, kind, value }); return query; },
      delete: () => { kind = "delete"; writes.push({ table, kind }); return query; },
      then: (resolve: (value: unknown) => void) => resolve({ data: table === "checkins" ? [] : null, error: duplicate && kind === "insert" ? { code: "23505" } : null }),
    }; return query;
  } };
  return { db: db as unknown as SupabaseClient<Database>, writes };
}
const now = new Date("2026-10-11T08:00:00Z");
const vapid = { publicKey: "test", privateKey: "test", subject: "mailto:test@example.com" };
beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
it("atomic claim prevents overlapping duplicate sends", async () => {
  const { db } = database(0, true); expect(await sendHabitReminders(db, vapid, now)).toEqual({ claimed: 0, delivered: 0, failed: 0 }); expect(fetch).not.toHaveBeenCalled();
});
it.each([404, 410])("removes gone subscriptions on %i", async (status) => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status })); const { db, writes } = database();
  await sendHabitReminders(db, vapid, now); expect(writes).toContainEqual({ table: "push_subscriptions", kind: "delete" });
});
it("increments consecutive failures", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("Network failure")); const { db, writes } = database(2);
  expect((await sendHabitReminders(db, vapid, now)).failed).toBe(1); expect(writes).toContainEqual({ table: "push_subscriptions", kind: "update", value: { failure_count: 3 } });
});
it("removes a subscription at five consecutive failures", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 })); const { db, writes } = database(4);
  await sendHabitReminders(db, vapid, now); expect(writes).toContainEqual({ table: "push_subscriptions", kind: "delete" });
});
it("resets failures and records the success timestamp", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 201 })); const { db, writes } = database(3);
  expect((await sendHabitReminders(db, vapid, now)).delivered).toBe(1); expect(writes).toContainEqual({ table: "push_subscriptions", kind: "update", value: { failure_count: 0, last_success_at: now.toISOString() } });
});