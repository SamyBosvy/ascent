import { Link } from '@tanstack/react-router';
import { BookOpen, Languages, Wrench, GraduationCap, FileText, Repeat } from 'lucide-react';
import { routeStats } from '@/lib/camp';
import { TYPE_LABEL, localDate, type RouteRow, type RouteAgg } from '@/lib/data';
import { getPrefs } from '@/lib/prefs';
import { activityLabel, lastRouteActivity } from '@/lib/visualProgress';
import { routeColourToken } from '@/lib/routeColours';
import { RouteDot } from './RouteDot';
import { AltitudeBar, CampBadge } from './Mountain';
const ICONS = { book: BookOpen, language: Languages, skill: Wrench, course: GraduationCap, paper: FileText, habit: Repeat };
export function LearningRouteCard({ route, agg }: { route: RouteRow; agg?: RouteAgg | undefined }) {
  const stats = routeStats(route, agg);
  const Icon = ICONS[route.type];
  return <Link to="/routes/$id" params={{ id: route.id }} className="surface route-accent block min-w-0 space-y-3 p-4 hover:border-primary/50" style={{ borderLeftColor: routeColourToken(route) }}>
    <div className="flex items-start justify-between gap-2"><p className="flex min-w-0 items-center gap-2 font-medium"><RouteDot route={route} /><span className="truncate">{route.name}</span></p><CampBadge camp={stats.camp} /></div>
    <div className="space-y-1 text-xs text-muted-foreground"><p className="flex items-center gap-2"><Icon className="size-4 shrink-0" aria-hidden />{TYPE_LABEL[route.type]}<span className="ml-auto font-semibold text-foreground">{Math.round(stats.score * 100)}%</span></p><p className="truncate">{activityLabel(lastRouteActivity(route, agg), localDate(), getPrefs().tz)}</p></div>
    <AltitudeBar camp={stats.camp} />
  </Link>;
}