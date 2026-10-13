/** Words safe for a prefix tsquery ('simple' config): letters/digits only, each matched as a prefix. */
export function prefixTsQuery(q: string) {
  return q.split(/[^\p{L}\p{N}_]+/u).filter(Boolean).map((w) => `${w}:*`).join(" & ");
}
/** Strip characters with meaning in PostgREST filters / ilike patterns. */
export const safeTerm = (s: string) => s.replace(/['’‘.:]/g, "_").replace(/[,()%*\\"\\]/g, " ").replace(/\s+/g, " ").trim();

/** Normalise a tag the way the database does: trimmed, lowercase, max 30 chars. */
export const normalizeTag = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ");
export const MAX_TAGS = 10;
export const MAX_TAG_LEN = 30;
/** Add comma-separated tags to a list; returns the new list and an error message for rejected input. */
export function addTags(current: string[], input: string): { tags: string[]; error?: string } {
  const out = [...current];
  let error: string | undefined;
  for (const raw of input.split(",")) {
    const t = normalizeTag(raw);
    if (!t || out.includes(t)) continue;
    if (t.length > MAX_TAG_LEN) { error = `Tags can be at most ${MAX_TAG_LEN} characters.`; continue; }
    if (out.length >= MAX_TAGS) { error = `A note can have at most ${MAX_TAGS} tags.`; break; }
    out.push(t);
  }
  return error ? { tags: out, error } : { tags: out };
}
