import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ refused: vi.fn(), rpc: vi.fn(), remove: vi.fn(), filter: vi.fn() }));
vi.mock("./pwa", () => ({ serviceWorkerRefused: mocks.refused }));
vi.mock("./push.functions", () => ({ getVapidPublicKey: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc, from: () => ({ delete: mocks.remove }) } }));
import { deleteSubscription, pushState, saveSubscription } from "./push";
beforeEach(() => {
  vi.clearAllMocks(); mocks.refused.mockReturnValue(false); mocks.rpc.mockResolvedValue({ error: null });
  mocks.remove.mockReturnValue({ eq: mocks.filter }); mocks.filter.mockResolvedValue({ error: null });
});
describe("notification states and private persistence", () => {
  it("refuses preview without requesting permission", async () => { mocks.refused.mockReturnValue(true); expect(await pushState()).toBe("host-unavailable"); });
  it("reports unsupported browsers", async () => { vi.stubGlobal("Notification", undefined); expect(await pushState()).toBe("unsupported"); vi.unstubAllGlobals(); });
  it("saves the exact browser subscription through the owner-scoped RPC", async () => {
    await saveSubscription({ toJSON: () => ({ endpoint: "https://fcm.googleapis.com/send/test", keys: { p256dh: "public-test-key", auth: "test-auth" } }) });
    expect(mocks.rpc).toHaveBeenCalledWith("save_push_subscription", { _endpoint: "https://fcm.googleapis.com/send/test", _p256dh: "public-test-key", _auth: "test-auth", _user_agent: navigator.userAgent });
  });
  it("rejects invalid subscriptions before saving", async () => { await expect(saveSubscription({ toJSON: () => ({ endpoint: "https://localhost/private", keys: {} }) })).rejects.toThrow(); expect(mocks.rpc).not.toHaveBeenCalled(); });
  it("deletes only the specified subscription under RLS", async () => { await deleteSubscription("https://fcm.googleapis.com/send/test"); expect(mocks.filter).toHaveBeenCalledWith("endpoint", "https://fcm.googleapis.com/send/test"); });
  it("does not swallow persistence failures", async () => { mocks.filter.mockResolvedValue({ error: { message: "Offline" } }); await expect(deleteSubscription("endpoint")).rejects.toThrow("Offline"); });
});