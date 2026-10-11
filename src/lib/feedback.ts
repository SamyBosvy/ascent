import { prefersReducedMotion } from "./motion";
import { vibrationEnabled } from "./prefs";

export type HapticKind = "light" | "success" | "warning";
const patterns: Record<HapticKind, number | number[]> = { light: 10, success: [10, 40, 10], warning: [30] };

/** User-action handlers only; never let unavailable device feedback affect a save. */
export function haptic(kind: HapticKind) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function" || prefersReducedMotion() || !vibrationEnabled()) return;
  try { navigator.vibrate(patterns[kind]); } catch { /* Unsupported or blocked by device policy. */ }
}