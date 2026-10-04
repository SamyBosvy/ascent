import { useEffect, useState, useSyncExternalStore } from "react";

// One running study session, persisted so navigation/refresh never loses it.
// Elapsed time is always derived from timestamps, never from interval ticks.
const KEY = "ascent:timer";
const EVT = "ascent:timer-change";

export type TimerState = {
  routeId: string;
  routeName: string;
  startedAt: number | null; // start of the current running segment; null when paused
  accumulatedMs: number; // time from previous segments
  paused: boolean;
};

let cache: { raw: string | null; value: TimerState | null } = { raw: null, value: null };
function read(): TimerState | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(KEY);
  if (raw !== cache.raw) {
    let value: TimerState | null = null;
    try {
      value = raw ? (JSON.parse(raw) as TimerState) : null;
    } catch {
      value = null;
    }
    cache = { raw, value };
  }
  return cache.value;
}
function write(s: TimerState | null) {
  if (s) localStorage.setItem(KEY, JSON.stringify(s));
  else localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVT));
}

export const elapsedMs = (s: TimerState | null, now = Date.now()) =>
  s ? s.accumulatedMs + (!s.paused && s.startedAt != null ? Math.max(0, now - s.startedAt) : 0) : 0;

export const timer = {
  get: read,
  start(routeId: string, routeName: string) {
    write({ routeId, routeName, startedAt: Date.now(), accumulatedMs: 0, paused: false });
  },
  pause() {
    const s = read();
    if (!s || s.paused) return;
    write({ ...s, accumulatedMs: elapsedMs(s), startedAt: null, paused: true });
  },
  resume() {
    const s = read();
    if (!s || !s.paused) return;
    write({ ...s, startedAt: Date.now(), paused: false });
  },
  setElapsed(ms: number) {
    const s = read();
    if (!s) return;
    write({ ...s, accumulatedMs: Math.max(0, ms), startedAt: s.paused ? null : Date.now() });
  },
  clear() {
    write(null);
  },
};

function subscribe(cb: () => void) {
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useTimer() {
  const state = useSyncExternalStore(subscribe, read, () => null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!state || state.paused) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [state]);
  return { state, elapsed: elapsedMs(state, Math.max(now, Date.now())) };
}

export function clockLabel(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${m}:${s}` : `${m}:${s}`;
}
