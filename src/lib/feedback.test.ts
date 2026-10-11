import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { haptic } from "./feedback";
import { setVibrationEnabled, vibrationEnabled } from "./prefs";

const vibrate = vi.fn();
beforeEach(() => {
  localStorage.clear(); vibrate.mockClear();
  Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
});
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
it("defaults on and uses the exact short patterns", () => {
  expect(vibrationEnabled()).toBe(true);
  haptic("light"); haptic("success"); haptic("warning");
  expect(vibrate.mock.calls).toEqual([[10], [[10, 40, 10]], [[30]]]);
});
it("does nothing on unsupported devices", () => {
  Object.defineProperty(navigator, "vibrate", { configurable: true, value: undefined });
  expect(() => haptic("success")).not.toThrow(); expect(vibrate).not.toHaveBeenCalled();
});
it("does nothing when reduced motion is enabled", () => {
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
  haptic("success"); expect(vibrate).not.toHaveBeenCalled();
});
it("persists device opt-out independently of account preferences", () => {
  setVibrationEnabled(false);
  localStorage.setItem("ascent-prefs", JSON.stringify({ theme: "dark", weekStart: 0, tz: "UTC" }));
  expect(vibrationEnabled()).toBe(false);
  haptic("warning"); expect(vibrate).not.toHaveBeenCalled();
  setVibrationEnabled(true); haptic("light"); expect(vibrate).toHaveBeenCalledWith(10);
});
it("device policy errors cannot fail the action", () => {
  vibrate.mockImplementationOnce(() => { throw new Error("blocked"); });
  expect(() => haptic("success")).not.toThrow();
});