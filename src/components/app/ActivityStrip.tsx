import { useActivityStrip, localDate } from '@/lib/data';
import { shortDate, weekday } from '@/lib/time';
import { Skeleton } from '@/components/ui/skeleton';
import { useProgressFeedback } from './ProgressFeedback';
const LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function ActivityStrip() {
  const feedback = useProgressFeedback();
  const { data, isError } = useActivityStrip();
  if (!data) return isError ? <p role="status" className="body-text text-muted-foreground">Activity unavailable.</p> : <div role="status" aria-busy="true" className="grid grid-cols-7 gap-2"><span className="sr-only">Loading activity</span>{Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  const today = localDate();
  const max = Math.max(1, ...data.map(d => d.reviews + d.minutes / 5 + d.checkins));
  return <section aria-label="Last seven days of activity"><ol className="grid grid-cols-7 gap-2">{data.map(d => {
    const amount = d.reviews + d.minutes / 5 + d.checkins;
    const level = amount === 0 ? 0 : Math.max(1, Math.ceil(amount / max * 3));
    const label = `${LABELS[weekday(d.day)]} ${shortDate(d.day)}: ${d.reviews} reviews, ${d.minutes} min, ${d.checkins} check-ins`;
    return <li key={d.day} aria-label={label} title={label} className="min-w-0 text-center"><span aria-hidden className="mb-2 block meta-text text-muted-foreground">{LABELS[weekday(d.day)]}</span><div aria-hidden className={`activity-cell activity-level-${level} ${feedback} h-8 rounded-sm ${d.day === today ? 'ring-2 ring-ring ring-offset-2 ring-offset-background' : ''}`} /><span aria-hidden className="mt-2 block meta-text text-muted-foreground">{d.day.slice(8)}</span></li>;
  })}</ol></section>;
}