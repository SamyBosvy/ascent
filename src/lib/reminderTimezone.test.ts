import { beforeEach, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
const mock = vi.hoisted(() => ({ getUser: vi.fn(), reads: vi.fn(), update: vi.fn(), upsert: vi.fn(), conditional: vi.fn(), single: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getUser: mock.getUser }, from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: mock.reads, single: mock.single }) }),
    update: mock.update, upsert: mock.upsert,
  }),
} }));
import { ensureReminderTimezone } from "./reminderTimezone";
beforeEach(() => {
  vi.restoreAllMocks(); vi.clearAllMocks();
  const real = Intl.DateTimeFormat;
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation((function (...args: Parameters<typeof Intl.DateTimeFormat>) {
    const formatter = new real(...args);
    if (!args.length) vi.spyOn(formatter, "resolvedOptions").mockReturnValue({ ...formatter.resolvedOptions(), timeZone: "Australia/Sydney" });
    return formatter;
  }) as typeof Intl.DateTimeFormat);
  mock.getUser.mockResolvedValue({ data: { user: { id: "user" } }, error: null });
  mock.reads.mockResolvedValue({ data: { timezone: null }, error: null });
  mock.update.mockReturnValue({ eq: () => ({ is: mock.conditional }) });
  mock.conditional.mockResolvedValue({ error: null }); mock.upsert.mockResolvedValue({ error: null });
  mock.single.mockResolvedValue({ data: { timezone: "Australia/Sydney" }, error: null });
});
it("sets null timezone to the validated device zone", async () => {
  expect(await ensureReminderTimezone(new QueryClient())).toBe("Australia/Sydney");
  expect(mock.update).toHaveBeenCalledWith({ timezone: "Australia/Sydney" }); expect(mock.conditional).toHaveBeenCalledWith("timezone", null);
});
it("never overwrites an existing timezone", async () => {
  mock.reads.mockResolvedValue({ data: { timezone: "Europe/Paris" }, error: null });
  expect(await ensureReminderTimezone(new QueryClient())).toBe("Europe/Paris"); expect(mock.update).not.toHaveBeenCalled(); expect(mock.upsert).not.toHaveBeenCalled();
});
it("creates a missing settings row with defaults without overwriting concurrent inserts", async () => {
  mock.reads.mockResolvedValue({ data: null, error: null }); await ensureReminderTimezone(new QueryClient());
  expect(mock.upsert).toHaveBeenCalledWith({ user_id: "user", timezone: "Australia/Sydney" }, { onConflict: "user_id", ignoreDuplicates: true });
});
it("ignores invalid device timezones without any database access", async () => {
  vi.restoreAllMocks(); const real = Intl.DateTimeFormat;
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation((function (...args: Parameters<typeof Intl.DateTimeFormat>) {
    const formatter = new real(...args);
    if (!args.length) vi.spyOn(formatter, "resolvedOptions").mockReturnValue({ ...formatter.resolvedOptions(), timeZone: "Invalid/Zone" });
    return formatter;
  }) as typeof Intl.DateTimeFormat);
  expect(await ensureReminderTimezone(new QueryClient())).toBeNull(); expect(mock.getUser).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();
});
it("reads back a concurrently chosen timezone instead of assuming the device zone won", async () => {
  mock.single.mockResolvedValue({ data: { timezone: "Europe/Paris" }, error: null });
  expect(await ensureReminderTimezone(new QueryClient())).toBe("Europe/Paris"); expect(mock.conditional).toHaveBeenCalledWith("timezone", null);
});