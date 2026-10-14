// SM-2 spaced repetition. Ratings: 0 Again, 1 Hard, 2 Good, 3 Easy.
export type Rating = 0 | 1 | 2 | 3;
/** Anki-style fixed ease deltas per rating (Again −0.20, Hard −0.15, Good 0, Easy +0.15) — softer than classic SM-2 so cards don't fall into ease hell. */
export const EASE_DELTA: Record<Rating, number> = { 0: -0.2, 1: -0.15, 2: 0, 3: 0.15 };

export function sm2(
  card: { ease: number; interval_days: number; reps: number },
  rating: Rating,
  now = new Date(),
) {
  let { ease, interval_days: interval, reps } = card;
  ease = Math.max(1.3, ease + EASE_DELTA[rating]);
  let due: Date;
  if (rating === 0) {
    reps = 0;
    interval = 0;
    due = new Date(now.getTime() + 10 * 60 * 1000);
  } else {
    reps += 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = rating === 1 ? 3 : 6;
    else interval = Math.round(interval * (rating === 1 ? 1.2 : ease) * (rating === 3 ? 1.3 : 1));
    interval = Math.max(1, interval);
    due = new Date(now.getTime() + interval * 86400000);
  }
  return { ease, interval_days: interval, reps, due_at: due.toISOString() };
}

/** ±~5% (min ±1 day) jitter for intervals ≥ 3 days so batches don't all land on one day. Never below 1. */
export function fuzzInterval(interval: number, rand = Math.random) {
  if (interval < 3) return interval;
  const spread = Math.max(1, Math.round(interval * 0.05));
  return Math.max(1, interval + Math.floor(rand() * (2 * spread + 1)) - spread);
}

/** SM-2 (unchanged) followed by interval fuzz. */
export function schedule(card: { ease: number; interval_days: number; reps: number }, rating: Rating, now = new Date()) {
  const next = sm2(card, rating, now);
  if (next.interval_days < 3) return next;
  const interval_days = fuzzInterval(next.interval_days);
  return { ...next, interval_days, due_at: new Date(now.getTime() + interval_days * 86400000).toISOString() };
}
