import { z } from "zod";

/** Backup import: validation, duplicate handling and id remapping (pure, unit-tested). */

export const BACKUP_VERSION = 1;
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_ROWS = 200_000;

const uuid = z.string().uuid();
const ts = z.string().datetime({ offset: true });
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const txt = (max: number) => z.string().max(max);

const routeSchema = z.object({
  id: uuid,
  name: txt(200).min(1),
  type: z.enum(["book", "language", "skill", "course", "paper", "habit"]),
  description: txt(5000).nullish(),
  target_date: day.nullish(),
  status: z.enum(["active", "paused", "summited", "abandoned"]).default("active"),
  color: z.number().int().min(1).max(10).nullish(),
  camp_override: z.number().int().min(0).max(4).nullish(),
  current_page: z.number().int().min(0).nullish(),
  total_pages: z.number().int().min(0).nullish(),
  habit_frequency: z.enum(["daily", "x_per_week", "weekly"]).nullish(),
  habit_target: z.number().int().nullish(),
  summited_at: ts.nullish(),
  created_at: ts.optional(),
  archived_at: ts.nullish(),
  deleted_at: ts.nullish(),
  speech_lang: z.string().regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/).nullish(),
});
const milestoneSchema = z.object({ id: uuid, route_id: uuid, title: txt(500), position: z.number().int().default(0), done: z.boolean().default(false), done_at: ts.nullish(), created_at: ts.optional() });
const sessionSchema = z.object({ id: uuid, route_id: uuid, minutes: z.number().int().min(1).max(100000), note: txt(5000).nullish(), logged_at: ts });
const cardSchema = z.object({
  id: uuid, route_id: uuid, front: txt(10000), back: txt(10000), example: txt(10000).nullish(), pronunciation: txt(1000).nullish(),
  ease: z.number().min(1).max(10), interval_days: z.number().int().min(0), reps: z.number().int().min(0), due_at: ts, created_at: ts.optional(),
  suspended_at: ts.nullish(), buried_until: day.nullish(), last_reviewed_at: ts.nullish(),
});
const reviewSchema = z.object({ id: uuid, card_id: uuid, route_id: uuid.optional(), rating: z.number().int().min(0).max(3), reviewed_at: ts });
const checkinSchema = z.object({ id: uuid, route_id: uuid, checked_on: day });
const noteSchema = z.object({ id: uuid, route_id: uuid, title: txt(500).default(""), body: txt(200000).default(""), tags: z.array(txt(100)).max(100).default([]), created_at: ts.optional() });

export const TABLES = ["routes", "milestones", "sessions", "cards", "reviews", "checkins", "notes"] as const;
export type Table = (typeof TABLES)[number];
const ROW: Record<Table, z.ZodTypeAny> = { routes: routeSchema, milestones: milestoneSchema, sessions: sessionSchema, cards: cardSchema, reviews: reviewSchema, checkins: checkinSchema, notes: noteSchema };

const fileSchema = z.object({
  version: z.literal(BACKUP_VERSION).optional(),
  exported_at: ts,
  routes: z.array(z.unknown()),
  milestones: z.array(z.unknown()).default([]),
  sessions: z.array(z.unknown()).default([]),
  cards: z.array(z.unknown()).default([]),
  reviews: z.array(z.unknown()).default([]),
  checkins: z.array(z.unknown()).default([]),
  notes: z.array(z.unknown()).default([]),
});

type Rows = {
  routes: z.infer<typeof routeSchema>[]; milestones: z.infer<typeof milestoneSchema>[]; sessions: z.infer<typeof sessionSchema>[];
  cards: z.infer<typeof cardSchema>[]; reviews: z.infer<typeof reviewSchema>[]; checkins: z.infer<typeof checkinSchema>[]; notes: z.infer<typeof noteSchema>[];
};
export type ParsedBackup = { exportedAt: string; rows: Rows; invalid: Record<Table, number> };

export type Counts = Record<Table, number>;
export const zeroCounts = (): Counts => ({ routes: 0, milestones: 0, sessions: 0, cards: 0, reviews: 0, checkins: 0, notes: 0 });

/** Validate a backup file. Throws a readable error for a wrong file; bad individual rows are counted as invalid. */
export function parseBackup(text: string): ParsedBackup {
  if (text.length > MAX_FILE_BYTES) throw new Error("This file is too large to be an Ascent backup.");
  let json: unknown;
  try { json = JSON.parse(text); } catch { throw new Error("This isn't a valid JSON file."); }
  const top = fileSchema.safeParse(json);
  if (!top.success) {
    const v = (json as { version?: unknown } | null)?.version;
    if (v !== undefined && v !== BACKUP_VERSION) throw new Error(`This backup was made by a newer version of Ascent (format ${String(v)}).`);
    throw new Error("This doesn't look like an Ascent backup (use the file from “Export all my data”).");
  }
  const total = TABLES.reduce((n, t) => n + top.data[t].length, 0);
  if (total > MAX_ROWS) throw new Error(`This backup has ${total.toLocaleString()} rows; the limit is ${MAX_ROWS.toLocaleString()}.`);
  const invalid = zeroCounts();
  const rows = {} as Record<Table, unknown[]>;
  for (const t of TABLES) {
    rows[t] = [];
    for (const r of top.data[t]) {
      const p = ROW[t].safeParse(r);
      if (p.success) rows[t].push(p.data);
      else invalid[t]++;
    }
  }
  return { exportedAt: top.data.exported_at, rows: rows as Rows, invalid };
}

export const routeKey = (r: { name: string; type: string }) => `${r.type}:${r.name.trim().toLowerCase()}`;

export type RoutePayload = {
  route: Omit<z.infer<typeof routeSchema>, "deleted_at">;
  milestones: Rows["milestones"]; sessions: Rows["sessions"]; cards: Rows["cards"];
  reviews: (Omit<Rows["reviews"][number], "route_id"> & { route_id: string })[]; checkins: Rows["checkins"]; notes: Rows["notes"];
};
export type ImportPlan = { payloads: RoutePayload[]; skipped: Counts; invalid: Counts; duplicates: number; toImport: Counts };

/**
 * Build the per-route payloads with brand-new ids. Every reference is remapped (children → new
 * route id, reviews → new card + route id); source ids and user ids are never reused. Rows whose
 * parent is missing (or skipped as a duplicate / deleted route) are counted as skipped.
 */
export function planImport(b: ParsedBackup, existing: { name: string; type: string }[], mode: "skip" | "copy", newId: () => string = () => crypto.randomUUID()): ImportPlan {
  const skipped = zeroCounts();
  const toImport = zeroCounts();
  const have = new Set(existing.map(routeKey));
  const routeMap = new Map<string, string>();
  const payloadByOld = new Map<string, RoutePayload>();
  const payloads: RoutePayload[] = [];
  let duplicates = 0;
  const seenIds = new Set<string>();

  for (const r of b.rows.routes) {
    if (seenIds.has(r.id) || r.deleted_at) { skipped.routes++; continue; }
    seenIds.add(r.id);
    const dup = have.has(routeKey(r));
    if (dup) duplicates++;
    if (dup && mode === "skip") { skipped.routes++; continue; }
    const id = newId();
    routeMap.set(r.id, id);
    const { deleted_at: _d, ...rest } = r;
    const name = dup ? `${r.name} (copy)`.slice(0, 200) : r.name;
    const p: RoutePayload = { route: { ...rest, id, name }, milestones: [], sessions: [], cards: [], reviews: [], checkins: [], notes: [] };
    payloads.push(p);
    payloadByOld.set(r.id, p);
    toImport.routes++;
  }

  const child = <K extends "milestones" | "sessions" | "checkins" | "notes">(t: K) => {
    const seenDays = new Set<string>();
    for (const row of b.rows[t] as Rows[K]) {
      const p = payloadByOld.get(row.route_id);
      if (!p) { skipped[t]++; continue; }
      if (t === "checkins") {
        const k = `${row.route_id}:${(row as Rows["checkins"][number]).checked_on}`;
        if (seenDays.has(k)) { skipped[t]++; continue; }
        seenDays.add(k);
      }
      (p[t] as unknown[]).push({ ...row, id: newId(), route_id: routeMap.get(row.route_id)! });
      toImport[t]++;
    }
  };
  child("milestones"); child("sessions"); child("checkins"); child("notes");

  const cardMap = new Map<string, { id: string; payload: RoutePayload }>();
  for (const c of b.rows.cards) {
    const p = payloadByOld.get(c.route_id);
    if (!p || cardMap.has(c.id)) { skipped.cards++; continue; }
    const id = newId();
    cardMap.set(c.id, { id, payload: p });
    p.cards.push({ ...c, id, route_id: p.route.id });
    toImport.cards++;
  }
  for (const v of b.rows.reviews) {
    const c = cardMap.get(v.card_id);
    if (!c) { skipped.reviews++; continue; }
    c.payload.reviews.push({ ...v, id: newId(), card_id: c.id, route_id: c.payload.route.id });
    toImport.reviews++;
  }
  return { payloads, skipped, invalid: b.invalid, duplicates, toImport };
}

export const payloadRows = (p: RoutePayload) => 1 + p.milestones.length + p.sessions.length + p.cards.length + p.reviews.length + p.checkins.length + p.notes.length;

/** Group route payloads into calls of roughly `size` rows (one route is never split). */
export function batchPayloads(payloads: RoutePayload[], size = 500): RoutePayload[][] {
  const out: RoutePayload[][] = [];
  let cur: RoutePayload[] = [];
  let n = 0;
  for (const p of payloads) {
    const k = payloadRows(p);
    if (cur.length && n + k > size) { out.push(cur); cur = []; n = 0; }
    cur.push(p);
    n += k;
  }
  if (cur.length) out.push(cur);
  return out;
}
