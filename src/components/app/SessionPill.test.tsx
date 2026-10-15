import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logSession = vi.fn();
vi.mock("@/lib/sessions", async (orig) => ({ ...(await orig<typeof import("@/lib/sessions")>()), logSession: (...a: unknown[]) => logSession(...a) }));
vi.mock("@/lib/data", () => ({ minutesLabel: (m: number) => `${m} min`, useRefresh: () => () => {}, useRoutes: () => ({ data: [] }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { StopSessionDialog, stopMinutes } from "./SessionPill";
import { timer } from "@/lib/timer";

function seed(ms: number) {
  localStorage.setItem("ascent:timer", JSON.stringify({ routeId: "r1", routeName: "Spanish", startedAt: null, accumulatedMs: ms, paused: true }));
}
beforeEach(() => { logSession.mockReset(); logSession.mockResolvedValue({}); });
afterEach(() => { cleanup(); localStorage.clear(); });

describe("stopMinutes", () => {
  it("logs at least 1 minute", () => expect(stopMinutes(5_000)).toBe(1));
  it("caps at 1440 minutes", () => expect(stopMinutes(30 * 3600_000)).toBe(1440));
  it("rounds to the nearest minute", () => expect(stopMinutes(25 * 60_000 + 40_000)).toBe(26));
});

describe("StopSessionDialog", () => {
  it("Save logs the elapsed minutes and clears the timer", async () => {
    seed(25 * 60_000);
    render(<StopSessionDialog open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Save 25 min" }));
    await waitFor(() => expect(logSession).toHaveBeenCalledWith({ route_id: "r1", minutes: 25 }));
    await waitFor(() => expect(timer.get()).toBeNull());
  });

  it("Discard clears the timer without logging", () => {
    seed(25 * 60_000);
    const close = vi.fn();
    render(<StopSessionDialog open onOpenChange={close} />);
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(timer.get()).toBeNull();
    expect(logSession).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledWith(false);
  });

  it("Cancel keeps the timer", () => {
    seed(25 * 60_000);
    render(<StopSessionDialog open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(timer.get()).not.toBeNull();
  });
});
