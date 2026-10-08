import type { QueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { del, get, set } from "idb-keyval";

declare const __APP_VERSION__: string;

const KEY = "ascent:query-cache";
export const CACHE_MAX_AGE = 7 * 86400000;

const persister = createAsyncStoragePersister({
  storage: { getItem: (k) => get(k), setItem: (k, v) => set(k, v), removeItem: (k) => del(k) },
  key: KEY,
  throttleTime: 2000,
});

let stop: (() => void) | null = null;
/** Keep the last-loaded data in IndexedDB so screens can show it offline. Scoped to one user. */
export function startPersisting(qc: QueryClient, userId: string) {
  if (stop) return;
  const [unsubscribe, restored] = persistQueryClient({
    queryClient: qc,
    persister,
    maxAge: CACHE_MAX_AGE,
    buster: `${typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev"}:${userId}`,
    dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === "success" && q.queryKey[0] !== "access" && q.queryKey[0] !== "search" },
  });
  stop = unsubscribe;
  return restored;
}

/** Drop the persisted cache (sign-out). */
export async function clearPersisted() {
  stop?.();
  stop = null;
  await del(KEY);
}
