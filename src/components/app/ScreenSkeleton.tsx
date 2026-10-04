import { Skeleton } from '@/components/ui/skeleton';
type Screen = 'today' | 'routes' | 'route' | 'review' | 'cards' | 'notes' | 'editor' | 'insights' | 'summits' | 'settings';
export function ScreenSkeleton({ screen }: { screen: Screen }) {
  const rows = <div className="space-y-3">{[0, 1, 2, 3].map(i => <div key={i} className="surface space-y-3 p-4"><Skeleton className="h-5 w-2/5" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/4" /></div>)}</div>;
  const tiles = <div className="grid gap-4 sm:grid-cols-2">{[0, 1].map(i => <div key={i} className="surface space-y-4 p-5"><Skeleton className="h-4 w-32" /><Skeleton className="h-12 w-20" /><Skeleton className="h-12 w-full" /></div>)}</div>;
  return <div role="status" aria-busy="true" aria-label="Loading" className="space-y-6"><span className="sr-only">Loading</span><Skeleton className="h-4 w-32" /><Skeleton className="h-9 w-56" />
    {screen === 'today' ? <>{tiles}<Skeleton className="h-6 w-40" />{rows}</> :
      screen === 'route' ? <><div className="grid gap-4 sm:grid-cols-[15rem_1fr]"><Skeleton className="h-80 w-full" /><div className="space-y-4">{tiles}<Skeleton className="h-12 w-full" /><Skeleton className="h-20 w-full" /></div></div><Skeleton className="h-6 w-40" />{rows}</> :
      screen === 'review' ? <><Skeleton className="h-12 w-full" /><div className="surface flex flex-col items-center gap-5 p-6"><Skeleton className="h-14 w-20" /><Skeleton className="h-5 w-56" /><Skeleton className="h-12 w-40" /></div>{tiles}</> :
      screen === 'editor' ? <><Skeleton className="h-12 w-72" /><Skeleton className="h-96 w-full" /></> :
      screen === 'insights' ? <>{tiles}<div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-64 w-full" /><Skeleton className="h-64 w-full" /></div></> :
      screen === 'settings' ? <>{tiles}<Skeleton className="h-32 w-full" /><Skeleton className="h-48 w-full" /></> :
      screen === 'routes' || screen === 'summits' ? <div className="grid gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map(i => <div key={i} className="surface space-y-4 p-4"><Skeleton className="h-6 w-3/4" /><Skeleton className="h-16 w-full" /><Skeleton className="h-4 w-1/2" /></div>)}</div> : <><Skeleton className="h-12 w-full" />{rows}</>}
  </div>;
}
