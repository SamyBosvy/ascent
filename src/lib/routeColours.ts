/** Stable route identity, independent of ordering, names or theme. */
export const ROUTE_COLOURS = [
  "Glacier blue", "Summit gold", "Teal", "Violet", "Forest green",
  "Copper", "Cyan", "Plum", "Lime", "Granite",
] as const;
export type ColourRoute = { id: string; color?: number | null | undefined; archived_at?: string | null; deleted_at?: string | null };

export function routeColour(route: ColourRoute): number {
  if (Number.isInteger(route.color) && route.color != null && route.color >= 1 && route.color <= 10) return route.color;
  let hash = 2166136261;
  for (const ch of route.id.toLowerCase()) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  return (hash >>> 0) % 10 + 1;
}

/** Lowest numbered least-used colour; archived/deleted routes do not occupy colours. */
export function leastUsedColour(routes: readonly ColourRoute[]): number {
  const counts = Array<number>(10).fill(0);
  for (const route of routes) {
    if (!route.archived_at && !route.deleted_at) {
      const index = routeColour(route) - 1;
      counts[index] = (counts[index] ?? 0) + 1;
    }
  }
  return counts.indexOf(Math.min(...counts)) + 1;
}
export const routeColourClass = (route: ColourRoute) => `route-colour-${routeColour(route)}`;
export const routeColourToken = (route: ColourRoute) => `var(--route-${routeColour(route)})`;