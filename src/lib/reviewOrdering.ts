/** Fisher-Yates shuffle; always returns a new array. */
export function shuffle<T>(items: readonly T[], random = Math.random): T[] {
  const result = [...items];
  for (let k = result.length - 1; k > 0; k--) {
    const j = Math.floor(random() * (k + 1));
    const a = result[k], b = result[j];
    if (a === undefined || b === undefined) continue;
    result[k] = b;
    result[j] = a;
  }
  return result;
}

const dayKey = (iso: string) => {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

/** Earlier due days first; only cards within the same local day are shuffled. */
export function orderQueue<T extends { due_at: string }>(cards: readonly T[], random = Math.random): T[] {
  const sorted = [...cards].sort((a, b) => a.due_at.localeCompare(b.due_at));
  const groups: T[][] = [];
  let previousDay: string | undefined;
  for (const card of sorted) {
    const day = dayKey(card.due_at);
    const last = groups.at(-1);
    if (day === previousDay && last) last.push(card);
    else groups.push([card]);
    previousDay = day;
  }
  return groups.flatMap(group => shuffle(group, random));
}