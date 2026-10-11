import type { RouteAgg, Session } from "./data";
import { queryClientForSync, queueWrite } from "./sync";

export const SESSION_MAX_MINUTES = 1440;

/** Validation message for a typed minutes value, or null when valid. */
export function minutesError(v: string): string | null {
  if (!/^\d+$/.test(v.trim())) return "Minutes must be a whole number.";
  const n = parseInt(v, 10);
  return n < 1 || n > SESSION_MAX_MINUTES ? `Minutes must be between 1 and ${SESSION_MAX_MINUTES}.` : null;
}

/** Log a study session through the outbox (works offline); the cached lists update at once. */
export async function logSession(input: { route_id: string; minutes: number; note?: string | null | undefined; logged_at?: string | undefined }) {
  if (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > SESSION_MAX_MINUTES) throw new Error(`Log between 1 and ${SESSION_MAX_MINUTES} minutes.`);
  const row = { id: crypto.randomUUID(), route_id: input.route_id, minutes: input.minutes, note: input.note ?? null, logged_at: input.logged_at ?? new Date().toISOString() };
  const qc = queryClientForSync();
  if (qc) {
    qc.setQueriesData<Session[]>({ queryKey: ["sessions", input.route_id, "list"] }, (list) =>
      list ? [{ ...row, user_id: "" } as Session, ...list].sort((a, b) => b.logged_at.localeCompare(a.logged_at)) : list,
    );
    qc.setQueriesData<Map<string, RouteAgg>>({ queryKey: ["route-stats"] }, (m) => {
      const a = m?.get(input.route_id);
      if (!m || !a) return m;
      return new Map(m).set(input.route_id, { ...a, minutes: a.minutes + row.minutes, session_count: a.session_count + 1, last_session_at: row.logged_at });
    });
    qc.setQueriesData<number>({ queryKey: ["sessions", "week-minutes"] }, (n) => (n == null ? n : n + row.minutes));
  }
  await queueWrite({ kind: "session_add", data: row }, row.id);
  return row;
}
