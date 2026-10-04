// SM-2 spaced repetition. Ratings: 0 Again, 1 Hard, 2 Good, 3 Easy.
export type Rating = 0 | 1 | 2 | 3;
const Q: Record<Rating, number> = { 0: 1, 1: 3, 2: 4, 3: 5 };

export function sm2(
  card: { ease: number; interval_days: number; reps: number },
  rating: Rating,
  now = new Date(),
) {
  const q = Q[rating];
  let { ease, interval_days: interval, reps } = card;
  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  let due: Date;
  if (q < 3) {
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
