export type NoteDraft = { title: string; body: string; routeId: string; tags: string[]; savedAt: string };

export const DRAFT_PREFIX = "ascent:note-draft:";

export function draftKey(userId: string, noteId: string | null | undefined): string {
  return `${DRAFT_PREFIX}${userId}:${noteId ?? "new"}`;
}

function store(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

export function readDraft(key: string): NoteDraft | null {
  try {
    const raw = store()?.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<NoteDraft>;
    if (typeof d.savedAt !== "string" || typeof d.title !== "string" || typeof d.body !== "string") return null;
    return { title: d.title, body: d.body, routeId: typeof d.routeId === "string" ? d.routeId : "", tags: Array.isArray(d.tags) ? d.tags.filter((t): t is string => typeof t === "string") : [], savedAt: d.savedAt };
  } catch { return null; }
}

export function writeDraft(key: string, draft: NoteDraft): void {
  try { store()?.setItem(key, JSON.stringify(draft)); } catch { /* storage unavailable */ }
}

export function removeDraft(key: string): void {
  try { store()?.removeItem(key); } catch { /* storage unavailable */ }
}

export function moveDraft(from: string, to: string): void {
  try {
    const s = store();
    const raw = s?.getItem(from);
    if (raw != null) { s!.setItem(to, raw); s!.removeItem(from); }
  } catch { /* storage unavailable */ }
}

/** True when the local draft is strictly newer than the server row (or there is no server row). */
export function draftIsNewer(draft: NoteDraft, serverUpdatedAt: string | null | undefined): boolean {
  const d = Date.parse(draft.savedAt);
  if (Number.isNaN(d)) return false;
  if (!serverUpdatedAt) return true;
  const s = Date.parse(serverUpdatedAt);
  return Number.isNaN(s) || d > s;
}

/** Removes every note draft key (all users when userId is omitted). */
export function clearDrafts(userId?: string): void {
  try {
    const s = store();
    if (!s) return;
    const prefix = userId ? `${DRAFT_PREFIX}${userId}:` : DRAFT_PREFIX;
    const keys: string[] = [];
    for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k?.startsWith(prefix)) keys.push(k); }
    keys.forEach((k) => s.removeItem(k));
  } catch { /* storage unavailable */ }
}

export const RETRY_DELAYS = [2000, 5000, 15000, 30000];
export function retryDelay(attempt: number): number {
  return RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)]!;
}
