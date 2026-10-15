import type { QueryClient } from "@tanstack/react-query";
import { persistQueryClient, type PersistedClient } from "@tanstack/react-query-persist-client";
import { deserializeCache, serializeCache } from "./cacheSerialization";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { del, get, set } from "idb-keyval";

declare const __APP_VERSION__: string;

const KEY = "ascent:query-cache";
export const CACHE_MAX_AGE = 7 * 86400000;

const persister = createAsyncStoragePersister({
  storage: { getItem: (k) => get(k), setItem: (k, v) => set(k, v), removeItem: (k) => del(k) },
  key: KEY,
  throttleTime: 10_000,
  serialize: serializeCache,
  deserialize: (value) => deserializeCache(value) as PersistedClient,
});

let stop: (() => void) | null = null;
/** Keep the last-loaded data in IndexedDB so screens can show it offline. Scoped to one user. */
export function startPersisting(qc: QueryClient, userId: string) {
  if (stop) return;
  const [unsubscribe, restored] = persistQueryClient({
    queryClient: qc,
    persister,
    maxAge: CACHE_MAX_AGE,
    buster: `maps-v1:${typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev"}:${userId}`,
    dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === "success" && q.queryKey[0] !== "access" && q.queryKey[0] !== "search" },
  });
  // Final write when the app is hidden, so the longer throttle never loses the latest data.
  const flush = () => {
    if (document.visibilityState !== "hidden") return;
    void persistQueryClientSave({ queryClient: qc, persister, buster: `maps-v1:${typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev"}:${userId}`, dehydrateOptions });
  };
  document.addEventListener("visibilitychange", flush);
  stop = () => { unsubscribe(); document.removeEventListener("visibilitychange", flush); };
  return restored;
}

/** Drop the persisted cache (sign-out). */
export async function clearPersisted() {
  stop?.();
  stop = null;
  await del(KEY);
}
