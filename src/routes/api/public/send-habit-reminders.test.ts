import { describe, it, expect, vi, beforeEach } from "vitest";

const token = { value: "db-token" as string | null };
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: token.value ? { token: token.value } : null }) }) }) }) },
}));
vi.mock("@/lib/sendHabitReminders", () => ({ sendHabitReminders: async () => ({ claimed: 0 }) }));
vi.mock("@/lib/vapid", () => ({ deriveVapid: async () => ({}) }));

import { handleSendHabitReminders } from "./send-habit-reminders";

const req = (auth?: string) => new Request("http://x", { method: "POST", headers: auth ? { authorization: auth } : {} });

describe("send-habit-reminders auth", () => {
  beforeEach(() => {
    token.value = "db-token";
    vi.stubEnv("LOVABLE_CRON_SECRET", "");
    vi.stubEnv("VAPID_KEY_SEED", "seed");
    vi.stubEnv("OWNER_EMAIL", "o@example.com");
  });
  it("accepts the database scheduler token", async () => {
    const r = await handleSendHabitReminders(req("Bearer db-token"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ claimed: 0 });
  });
  it("still accepts the cron secret when set", async () => {
    vi.stubEnv("LOVABLE_CRON_SECRET", "cron");
    expect((await handleSendHabitReminders(req("Bearer cron"))).status).toBe(200);
  });
  it("rejects missing or wrong bearer", async () => {
    expect((await handleSendHabitReminders(req())).status).toBe(401);
    expect((await handleSendHabitReminders(req("Bearer nope"))).status).toBe(401);
    token.value = null;
    expect((await handleSendHabitReminders(req("Bearer db-token"))).status).toBe(401);
  });
});
