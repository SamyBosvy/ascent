import { Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useSubmission } from '@/hooks/use-submission';
import { type RouteRow, type RouteAgg, minutesLabel } from '@/lib/data';
import { dateInZone, daysBetween, shortDate } from '@/lib/time';
import { getPrefs } from '@/lib/prefs';
import { RouteDot } from './RouteDot';

export function SummitOverlay({ route, agg, onDone, returnFocus }: { route: RouteRow; agg?: RouteAgg | undefined; onDone: () => void; returnFocus: HTMLElement | null }) {
  const tz = getPrefs().tz;
  const day = dateInZone(new Date(route.summited_at ?? route.created_at), tz);
  const days = Math.max(1, daysBetween(dateInZone(new Date(route.created_at), tz), day) + 1);
  const time = Number(agg?.minutes ?? 0);
  const text = `I summited ${route.name} on ${shortDate(day)} after ${days} day${days === 1 ? '' : 's'}${time ? ` and ${minutesLabel(time)} of study` : ''}.`;
  const { submitting, submit } = useSubmission();
  function share() { void submit(async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'Summit reached — Ascent', text }); return; }
      catch (error) { if (error instanceof Error && error.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(text); toast.success('Summit summary copied.'); }
    catch { toast.error('Couldn’t copy the summary. Please try again.'); }
  }); }
  return <Dialog open onOpenChange={open => { if (!open) onDone(); }}><DialogContent className="summit-dialog max-h-[90dvh] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg [&>button]:size-12 [&>button]:right-1 [&>button]:top-1" onCloseAutoFocus={event => { event.preventDefault(); if (returnFocus?.isConnected) returnFocus.focus(); else document.querySelector<HTMLElement>('#main h1')?.focus(); }}>
    <svg viewBox="0 0 260 220" className="mx-auto h-44 w-52" aria-hidden><path d="M10 210 L130 70 L250 210 Z" className="fill-ridge" /><path d="M130 70 L108 120 L122 112 L130 128 L140 110 L154 120 Z" className="fill-background" /><g data-summit-flag><line x1="130" y1="72" x2="130" y2="12" className="stroke-foreground" strokeWidth="3" /><path d="M131 14 L172 24 L131 36 Z" className="fill-gold" /></g></svg>
    <p className="text-center text-sm font-semibold text-gold-text">Summit reached</p>
    <DialogTitle className="flex items-center justify-center gap-2 text-center text-2xl leading-snug"><RouteDot route={route} /><span className="min-w-0 break-words">{route.name}</span></DialogTitle>
    <DialogDescription className="text-center">{days} day{days === 1 ? '' : 's'} taken · {shortDate(day)}</DialogDescription>
    <div className="flex flex-wrap justify-center gap-4 text-sm">{time > 0 && <p>{minutesLabel(time)} logged</p>}{Number(agg?.reviews_recent ?? 0) > 0 && <p>{agg?.reviews_recent} reviews in the last 30 days</p>}</div>
    <div className="flex justify-center gap-3"><Button variant="outline" className="h-12" disabled={submitting} onClick={share}><Share2 className="size-4" />Share</Button><Button className="h-12" onClick={onDone}>Close</Button></div>
  </DialogContent></Dialog>;
}
