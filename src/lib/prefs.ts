import { browserTimeZone, isValidTimeZone, type WeekStart } from "./time";

export type Theme = "light" | "dark" | "system";
export type Prefs = { tz: string; weekStart: WeekStart; theme: Theme };

/** localStorage cache of the user's preferences; the database row is the source of truth. */
export const PREFS_KEY = "ascent-prefs";
export const THEME_KEY = "ascent-theme";

let cur: Prefs | null = null;

const defaults = (): Prefs => ({ tz: browserTimeZone(), weekStart: 1, theme: "system" });

export function getPrefs(): Prefs {
  if (cur) return cur;
  const d = defaults();
  if (typeof window === "undefined") return d;
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as Partial<Prefs> | null;
    cur = {
      tz: raw?.tz && isValidTimeZone(raw.tz) ? raw.tz : d.tz,
      weekStart: raw?.weekStart === 0 ? 0 : 1,
      theme: raw?.theme === "light" || raw?.theme === "dark" ? raw.theme : "system",
    };
  } catch {
    cur = d;
  }
  return cur;
}

/** Update the in-memory + cached prefs. Returns true when tz or week start changed (date-based data must refetch). */
export function setPrefs(p: Prefs) {
  const old = getPrefs();
  cur = p;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    localStorage.setItem(THEME_KEY, p.theme);
  } catch { /* private mode */ }
  applyTheme(p.theme);
  return old.tz !== p.tz || old.weekStart !== p.weekStart;
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const el = document.documentElement;
  el.classList.toggle("dark", dark);
  el.classList.toggle("light", !dark);
  el.style.colorScheme = dark ? "dark" : "light";
  // Read the actual themed background rather than maintaining a separate palette.
  const background = getComputedStyle(el).getPropertyValue("--background").trim();
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.content = background || (dark ? "#15202D" : "#F9FBFD");
    meta.media = "";
  });
}

/** Follow the OS setting live while the theme is System. Call from an effect. */
export function watchSystemTheme() {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const on = () => { if (getPrefs().theme === "system") applyTheme("system"); };
  mq.addEventListener("change", on);
  return () => mq.removeEventListener("change", on);
}

/** Runs before first paint (inline in <head>) so there is no theme flash. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var e=document.documentElement;e.classList.add(d?'dark':'light');e.classList.remove(d?'light':'dark');e.style.colorScheme=d?'dark':'light';if(t!=='system'){document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.content=d?'#15202D':'#F9FBFD';m.media=''})}}catch(_){}})()`;
