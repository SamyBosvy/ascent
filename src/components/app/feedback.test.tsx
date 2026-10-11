import { act, cleanup, renderHook } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { successFeedback, SuccessTick, useSuccessTick } from "./SuccessTick";
import { useProgressFeedback } from "./ProgressFeedback";

const { success, haptic } = vi.hoisted(() => ({ success: vi.fn(), haptic: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success } }));
vi.mock("@/lib/feedback", () => ({ haptic }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks(); });
it("keeps success announced through the existing toast while its tick is decorative", () => {
  successFeedback("Card added.");
  expect(success).toHaveBeenCalledWith("Card added.", expect.objectContaining({ icon: expect.anything() }));
  expect(haptic).toHaveBeenCalledWith("success");
  // Decorative icon never introduces a second success announcement.
  expect(success.mock.calls[0]?.[1].icon.props).not.toHaveProperty("role", "status");
  const markup = renderToStaticMarkup(<SuccessTick />);
  expect(markup).toContain('aria-hidden="true"');
});
it("shows ticks only on accepted actions and removes them after 900ms", () => {
  vi.useFakeTimers(); const { result } = renderHook(useSuccessTick);
  expect(result.current.active).toBeNull();
  act(() => result.current.show("milestone-1")); expect(result.current.active).toBe("milestone-1");
  act(() => vi.advanceTimersByTime(900)); expect(result.current.active).toBeNull();
});
it("paints progress without a mount transition and enables subsequent changes", () => {
  function Probe() { return <span>{useProgressFeedback() || "static"}</span>; }
  expect(renderToStaticMarkup(<Probe />)).toContain("static");
  const firstRenders: string[] = [];
  const { result } = renderHook(() => { const value = useProgressFeedback(); firstRenders.push(value); return value; });
  expect(firstRenders[0]).toBe(""); expect(result.current).toBe("progress-feedback");
});
it("progress jumps under reduced motion", () => {
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList);
  const { result } = renderHook(useProgressFeedback); expect(result.current).toBe("");
});