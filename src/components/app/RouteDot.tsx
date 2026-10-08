import { routeColourClass, type ColourRoute } from "@/lib/routeColours";

export function RouteDot({ route }: { route: ColourRoute }) {
  return <span aria-hidden="true" className={`route-dot ${routeColourClass(route)}`} />;
}