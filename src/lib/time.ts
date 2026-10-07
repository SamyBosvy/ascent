/** Pure, timezone-aware calendar helpers. Dates are "YYYY-MM-DD" strings in the user's timezone. */
export type WeekStart = 0 | 1; // 0 = Sunday, 1 = Monday

export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

function parts(d: Date, tz: string) {
  const o: Record<string, number> = {};
  for (const p of fmt(tz).formatToParts(d)) if (p.type !== "literal") o[p.type] = Number(p.value);
  return { y: o["year"]!, m: o["month"]!, d: o["day"]!, h: o["hour"]! % 24, mi: o["minute"]!, s: o["second"]! };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Calendar date of an instant in a timezone. */
export function dateInZone(d: Date, tz: string) {
  const p = parts(d, tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** Offset (ms) of tz from UTC at instant d. */
function offsetMs(d: Date, tz: string) {
  const p = parts(d, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(d.getTime() / 1000) * 1000;
}

/** The instant a calendar day starts in a timezone (DST-safe). */
export function zonedMidnight(day: string, tz: string) {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offsetMs(new Date(guess), tz);
  t = guess - offsetMs(new Date(t), tz);
  return new Date(t);
}

const toUTC = (day: string) => {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};
const fromUTC = (t: number) => new Date(t).toISOString().slice(0, 10);

export const addDays = (day: string, n: number) => fromUTC(toUTC(day) + n * 86400000);
export const daysBetween = (a: string, b: string) => Math.round((toUTC(b) - toUTC(a)) / 86400000);
export const weekday = (day: string) => new Date(toUTC(day)).getUTCDay();

/** First day of the week containing `day`. */
export function weekStartOf(day: string, ws: WeekStart) {
  return addDays(day, -((weekday(day) - ws + 7) % 7));
}

/** "1 Nov" (adds the year when it differs from `today`'s). */
export function shortDate(day: string, today?: string) {
  const sameYear = !today || today.slice(0, 4) === day.slice(0, 4);
  return new Date(toUTC(day)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC", ...(sameYear ? {} : { year: "numeric" }) });
}
