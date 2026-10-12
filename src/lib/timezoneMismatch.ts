import { isValidTimeZone } from "./time";

/** UTC offset in minutes for a zone at the current instant. */
function utcOffsetMinutes(tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(new Date());
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  if (!m) return 0;
  const mins = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === "-" ? -mins : mins;
}

/** True only when a saved zone and the device zone are both valid, differ, and have different UTC offsets now. */
export function mismatch(saved: string | null, device: string): boolean {
  if (!saved) return false;
  if (!isValidTimeZone(saved) || !isValidTimeZone(device)) return false;
  if (saved === device) return false;
  return utcOffsetMinutes(saved) !== utcOffsetMinutes(device);
}

export function dismissKey(userId: string): string {
  return `ascent:tz-dismissed:${userId}`;
}

/** True when the stored dismissal matches this exact device/saved pair. */
export function isDismissed(storedValue: string | null, device: string, saved: string): boolean {
  return storedValue === `${device}|${saved}`;
}
