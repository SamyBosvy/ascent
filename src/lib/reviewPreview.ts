import { schedule, type Rating } from './srs';
export function previewSchedules(card: Parameters<typeof schedule>[0], now = new Date()) {
  return { 0: schedule(card, 0, now), 1: schedule(card, 1, now), 2: schedule(card, 2, now), 3: schedule(card, 3, now) } satisfies Record<Rating, ReturnType<typeof schedule>>;
}
export function intervalLabel(next: ReturnType<typeof schedule>, now?: Date) {
  const days = next.interval_days;
  if (days === 0) {
    const minutes = now ? Math.max(0, (new Date(next.due_at).getTime() - now.getTime()) / 60000) : 10;
    return minutes < 1 ? '<1m' : `${Math.round(minutes)}m`;
  }
  if (days < 21) return `${days}d`;
  if (days < 60) return `${Math.round(days / 7)}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Number((days / 365).toFixed(1))}y`;
}
