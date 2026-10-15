import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Long gcTime so the persisted (IndexedDB) cache can show last-loaded data offline.
  // staleTime avoids refetching every query on each tab switch; mutations invalidate explicitly.
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 7 * 86400000, staleTime: 60_000 } } });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });

  return router;
};
