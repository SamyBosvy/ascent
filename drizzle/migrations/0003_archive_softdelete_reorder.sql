ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS routes_user_deleted_idx ON public.routes (user_id, deleted_at);

-- Atomic swap of two milestone positions; RLS + explicit auth.uid() scope.
CREATE OR REPLACE FUNCTION public.swap_milestones(_a uuid, _b uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE pa int; pb int; ra uuid; rb uuid;
BEGIN
  SELECT position, route_id INTO pa, ra FROM milestones WHERE id = _a AND user_id = auth.uid() FOR UPDATE;
  SELECT position, route_id INTO pb, rb FROM milestones WHERE id = _b AND user_id = auth.uid() FOR UPDATE;
  IF ra IS NULL OR rb IS NULL OR ra <> rb THEN RAISE EXCEPTION 'milestone not found' USING ERRCODE = 'P0002'; END IF;
  UPDATE milestones SET position = CASE WHEN id = _a THEN pb ELSE pa END
    WHERE id IN (_a, _b) AND user_id = auth.uid();
END $$;
REVOKE ALL ON FUNCTION public.swap_milestones(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.swap_milestones(uuid, uuid) TO authenticated;

-- Hard-delete the caller's soft-deleted routes once the undo window has passed (cascades to children).
CREATE OR REPLACE FUNCTION public.purge_deleted_routes(_older_than_seconds int DEFAULT 10)
RETURNS int LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  WITH d AS (
    DELETE FROM routes WHERE user_id = auth.uid() AND deleted_at IS NOT NULL
      AND deleted_at <= now() - make_interval(secs => _older_than_seconds)
    RETURNING 1)
  SELECT count(*)::int FROM d
$$;
REVOKE ALL ON FUNCTION public.purge_deleted_routes(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_deleted_routes(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.minutes_since(_since timestamptz)
RETURNS bigint LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(sum(s.minutes), 0)::bigint FROM sessions s JOIN routes r ON r.id = s.route_id
  WHERE s.logged_at >= _since AND r.deleted_at IS NULL
$$;

CREATE OR REPLACE FUNCTION public.route_stats(_since_date date, _since_ts timestamptz, _week_date date, _today date)
RETURNS TABLE(route_id uuid, milestones_total integer, milestones_done integer, last_milestone_at timestamptz, minutes bigint, session_count integer, last_session_at timestamptz, cards_total integer, cards_mature integer, cards_due integer, reviews_recent integer, reviews_recent_good integer, last_review_at timestamptz, checkins_recent integer, checkins_week integer, checked_today boolean, last_checkin_on date)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT r.id,
    (SELECT count(*) FROM milestones m WHERE m.route_id = r.id)::int,
    (SELECT count(*) FROM milestones m WHERE m.route_id = r.id AND m.done)::int,
    (SELECT max(m.done_at) FROM milestones m WHERE m.route_id = r.id),
    (SELECT coalesce(sum(s.minutes), 0) FROM sessions s WHERE s.route_id = r.id)::bigint,
    (SELECT count(*) FROM sessions s WHERE s.route_id = r.id)::int,
    (SELECT max(s.logged_at) FROM sessions s WHERE s.route_id = r.id),
    (SELECT count(*) FROM cards c WHERE c.route_id = r.id)::int,
    (SELECT count(*) FROM cards c WHERE c.route_id = r.id AND c.interval_days >= 21)::int,
    (SELECT count(*) FROM cards c WHERE c.route_id = r.id AND c.due_at <= now())::int,
    (SELECT count(*) FROM reviews v WHERE v.route_id = r.id AND v.reviewed_at > _since_ts)::int,
    (SELECT count(*) FROM reviews v WHERE v.route_id = r.id AND v.reviewed_at > _since_ts AND v.rating >= 2)::int,
    (SELECT max(v.reviewed_at) FROM reviews v WHERE v.route_id = r.id AND v.reviewed_at > _since_ts),
    (SELECT count(*) FROM checkins k WHERE k.route_id = r.id AND k.checked_on >= _since_date)::int,
    (SELECT count(*) FROM checkins k WHERE k.route_id = r.id AND k.checked_on >= _week_date)::int,
    EXISTS (SELECT 1 FROM checkins k WHERE k.route_id = r.id AND k.checked_on = _today),
    (SELECT max(k.checked_on) FROM checkins k WHERE k.route_id = r.id)
  FROM routes r WHERE r.deleted_at IS NULL
$$;