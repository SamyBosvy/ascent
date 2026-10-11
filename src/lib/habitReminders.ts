import { habitDueToday } from "./camp";
import type { RouteAgg, RouteRow } from "./data";
import { dateInZone, isValidTimeZone } from "./time";

export function reminderEligible(route: RouteRow, agg: RouteAgg | undefined, now: Date, timezone: string, reminded: boolean) {
  if (route.type !== "habit" || !route.reminder_enabled || route.deleted_at || route.archived_at || route.status !== "active" || reminded || !isValidTimeZone(timezone) || !habitDueToday(route, agg)) return false;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(now);
  const part = (name: string) => Number(parts.find((p) => p.type === name)?.value ?? 0);
  const [hour = 0, minute = 0, second = 0] = route.reminder_time.split(":").map(Number);
  const elapsed = part("hour") * 3600 + part("minute") * 60 + part("second") - (hour * 3600 + minute * 60 + second);
  return elapsed >= 0 && elapsed < 900;
}
export function reminderPayload(route: Pick<RouteRow, "id" | "name">, day: string) {
  return { title: "Ascent", body: `Time for ${route.name} — keep your streak going.`, tag: `habit:${route.id}:${day}`, data: { url: `/routes/${route.id}` } };
}
export { dateInZone };

/** Only browser push providers, never arbitrary subscription URLs (SSRF). */
export function validPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && (
      ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"].includes(url.hostname) || url.hostname.endsWith(".notify.windows.com")
    );
  } catch { return false; }
}