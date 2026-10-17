import { expect, it, vi } from "vitest";
import { initializeInstall, installedSnapshot, installPlatform, isInstalled, promptInstall } from "./install";

it.each([
  ["Mozilla/5.0 (Linux; Android 14) Chrome/125 Mobile Safari/537.36", 0, "android-chrome"],
  ["Mozilla/5.0 (iPhone) Version/17.0 Mobile Safari/604.1", 0, "ios-safari"],
  ["Mozilla/5.0 (Macintosh) Version/17.0 Safari/605.1", 5, "ios-safari"],
  ["Mozilla/5.0 (iPhone) CriOS/125 Mobile Safari/604.1", 0, "ios-other"],
  ["Mozilla/5.0 (iPhone) FxiOS/125 Mobile Safari/604.1", 0, "ios-other"],
  ["Mozilla/5.0 (Android) SamsungBrowser/25 Chrome/125", 0, "samsung"],
  ["Mozilla/5.0 (Android) Firefox/125", 0, "firefox-android"],
  ["Mozilla/5.0 (Windows) Firefox/125", 0, "firefox-desktop"],
  ["Mozilla/5.0 (Windows) Chrome/125 Edg/125", 0, "desktop"],
  ["Unknown browser", 0, "other"],
] as const)("detects installation platform for %s", (ua, touch, expected) => {
  expect(installPlatform(ua, touch)).toBe(expected);
});

it("hides only in installed display mode or iOS standalone", () => {
  expect(isInstalled(false, false)).toBe(false);
  expect(isInstalled(true, false)).toBe(true);
  expect(isInstalled(false, true)).toBe(true);
});

it("captures a native prompt without showing it until tapped and never remembers dismissal", async () => {
  let mediaChanged: (() => void) | undefined;
  const media = { matches: false, addEventListener: (_: string, listener: () => void) => { mediaChanged = listener; } };
  vi.spyOn(window, "matchMedia").mockReturnValue(media as unknown as MediaQueryList);
  initializeInstall();
  expect(await promptInstall()).toBe(false);
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = new Event("beforeinstallprompt", { cancelable: true });
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome: "dismissed" }) });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(prompt).not.toHaveBeenCalled();
  expect(await promptInstall()).toBe(true);
  expect(prompt).toHaveBeenCalledTimes(1);
  expect(installedSnapshot()).toBe(false);
  expect(await promptInstall()).toBe(false);
  media.matches = true;
  mediaChanged?.();
  expect(installedSnapshot()).toBe(true);
  media.matches = false;
  mediaChanged?.();
  expect(installedSnapshot()).toBe(false);
  vi.restoreAllMocks();
});