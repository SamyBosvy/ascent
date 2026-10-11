import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ state: vi.fn(), enable: vi.fn(), disable: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/lib/reminderTimezone", () => ({ ensureReminderTimezone: vi.fn().mockResolvedValue("Australia/Sydney") }));
vi.mock("@/lib/push", () => ({ pushState: mock.state, enablePush: mock.enable, disablePush: mock.disable }));
vi.mock("@/lib/sync", () => ({ requireOnline: () => true }));
import { PushPreferences } from "./PushPreferences";
beforeEach(() => vi.clearAllMocks());
it.each(["blocked", "unsupported", "install", "host-unavailable"])("does not offer a permission prompt in %s state", async (state) => {
  mock.state.mockResolvedValue(state); render(<PushPreferences />);
  await waitFor(() => expect(screen.getByRole("status").textContent).not.toContain("Checking"));
  expect(screen.queryByRole("button", { name: "Enable notifications" })).toBeNull(); expect(mock.enable).not.toHaveBeenCalled();
});
it("requests permission only after an explicit Enable tap", async () => {
  mock.state.mockResolvedValue("available"); mock.enable.mockResolvedValue("enabled"); render(<PushPreferences />);
  const button = await screen.findByRole("button", { name: "Enable notifications" }); expect(mock.enable).not.toHaveBeenCalled();
  fireEvent.click(button); await screen.findByRole("button", { name: "Disable notifications" }); expect(mock.enable).toHaveBeenCalledTimes(1);
});