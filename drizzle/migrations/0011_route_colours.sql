ALTER TABLE public.routes ADD COLUMN color smallint;
ALTER TABLE public.routes ADD CONSTRAINT routes_color_range CHECK (color BETWEEN 1 AND 10);

CREATE OR REPLACE FUNCTION public.import_route(_data jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  rid uuid := (_data->'route'->>'id')::uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF rid IS NULL THEN RAISE EXCEPTION 'Route id missing' USING ERRCODE = '22023'; END IF;
  INSERT INTO routes (id, user_id, name, type, description, target_date, status, camp_override, current_page, total_pages, habit_frequency, habit_target, summited_at, created_at, archived_at, speech_lang, color)
  SELECT rid, uid, r.name, r.type, r.description, r.target_date, coalesce(r.status, 'active'), r.camp_override, r.current_page, r.total_pages, r.habit_frequency, r.habit_target, r.summited_at, coalesce(r.created_at, now()), r.archived_at, r.speech_lang, r.color
  FROM jsonb_populate_record(NULL::routes, _data->'route') r;
  INSERT INTO milestones (id, user_id, route_id, title, position, done, done_at, created_at)
  SELECT m.id, uid, rid, m.title, coalesce(m.position, 0), coalesce(m.done, false), m.done_at, coalesce(m.created_at, now())
  FROM jsonb_populate_recordset(NULL::milestones, coalesce(_data->'milestones', '[]'::jsonb)) m;
  INSERT INTO sessions (id, user_id, route_id, minutes, note, logged_at)
  SELECT s.id, uid, rid, s.minutes, s.note, coalesce(s.logged_at, now())
  FROM jsonb_populate_recordset(NULL::sessions, coalesce(_data->'sessions', '[]'::jsonb)) s;
  INSERT INTO cards (id, user_id, route_id, front, back, example, pronunciation, ease, interval_days, reps, due_at, created_at, suspended_at, buried_until, last_reviewed_at)
  SELECT c.id, uid, rid, c.front, c.back, c.example, c.pronunciation, coalesce(c.ease, 2.5), coalesce(c.interval_days, 0), coalesce(c.reps, 0), coalesce(c.due_at, now()), coalesce(c.created_at, now()), c.suspended_at, c.buried_until, c.last_reviewed_at
  FROM jsonb_populate_recordset(NULL::cards, coalesce(_data->'cards', '[]'::jsonb)) c;
  INSERT INTO reviews (id, user_id, card_id, route_id, rating, reviewed_at)
  SELECT v.id, uid, v.card_id, rid, v.rating, coalesce(v.reviewed_at, now())
  FROM jsonb_populate_recordset(NULL::reviews, coalesce(_data->'reviews', '[]'::jsonb)) v
  WHERE EXISTS (SELECT 1 FROM cards k WHERE k.id = v.card_id AND k.route_id = rid);
  INSERT INTO checkins (id, user_id, route_id, checked_on)
  SELECT k.id, uid, rid, k.checked_on
  FROM jsonb_populate_recordset(NULL::checkins, coalesce(_data->'checkins', '[]'::jsonb)) k
  ON CONFLICT (route_id, checked_on) DO NOTHING;
  INSERT INTO notes (id, user_id, route_id, title, body, tags, created_at)
  SELECT n.id, uid, rid, coalesce(n.title, ''), coalesce(n.body, ''), coalesce(n.tags, '{}'), coalesce(n.created_at, now())
  FROM jsonb_populate_recordset(NULL::notes, coalesce(_data->'notes', '[]'::jsonb)) n;
END;
$$;
REVOKE ALL ON FUNCTION public.import_route(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_route(jsonb) TO authenticated;