/// <reference types="vite-plugin-pwa/client" />
// The only place that registers the app's service worker (/sw.js).

const SW_PATH = "/sw.js";

export function serviceWorkerRefused() {
  if (!import.meta.env.PROD) return true;
  try { if (window.self !== window.top) return true; } catch { return true; }
  const h = window.location.hostname;
  if (h.startsWith("id-preview--") || h.startsWith("preview--")) return true;
  if (/(^|\.)lovableproject(-dev)?\.com$/.test(h) || /(^|\.)beta\.lovable\.dev$/.test(h)) return true;
  if (new URLSearchParams(window.location.search).get("sw") === "off") return true;
  return false;
}

async function unregisterOurs() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.filter((r) => [r.active, r.waiting, r.installing].some((w) => w?.scriptURL.endsWith(SW_PATH))).map((r) => r.unregister()));
}

let updateFn: ((reload?: boolean) => Promise<void>) | null = null;
const updateListeners = new Set<() => void>();
let updateReady = false;

export function onUpdateReady(cb: () => void) {
  updateListeners.add(cb);
  if (updateReady) cb();
  return () => { updateListeners.delete(cb); };
}
/** Activate the waiting version and reload. */
export function applyUpdate() {
  if (updateFn) void updateFn(true);
  else window.location.reload();
}

let started = false;
/** Call from an effect. New versions wait until the user chooses to reload. */
export async function registerServiceWorker() {
  if (started || typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  started = true;
  if (serviceWorkerRefused()) { await unregisterOurs(); return; }
  const { registerSW } = await import("virtual:pwa-register");
  updateFn = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateReady = true;
      updateListeners.forEach((l) => l());
    },
  });
}
