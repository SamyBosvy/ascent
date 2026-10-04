CREATE OR REPLACE FUNCTION public.route_stats(_since_date date, _since_ts timestamptz, _week_date date, _today date)
RETURNS TABLE (
  route_id uuid,
  milestones_total int,
  milestones_done int,
  last_milestone_at timestamptz,
  minutes bigint,
  session_count int,
  last_session_at timestamptz,
  cards_total int,
  cards_mature int,
  cards_due int,
  reviews_recent int,
  reviews_recent_good int,
  last_review_at timestamptz,
  checkins_recent int,
  checkins_week int,
  checked_today boolean,
  last_checkin_on date
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
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
  FROM routes r
$$;
REVOKE EXECUTE ON FUNCTION public.route_stats(date, timestamptz, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.route_stats(date, timestamptz, date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.minutes_since(_since timestamptz)
RETURNS bigint
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$ SELECT coalesce(sum(minutes), 0)::bigint FROM sessions WHERE logged_at >= _since $$;
REVOKE EXECUTE ON FUNCTION public.minutes_since(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minutes_since(timestamptz) TO authenticated;

-- Atomic, idempotent review save: card schedule update + review row in one transaction.
CREATE OR REPLACE FUNCTION public.record_review(
  _review_id uuid, _card_id uuid, _rating int, _ease real, _interval_days int, _due_at timestamptz, _reps int, _reviewed_at timestamptz
) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE _route uuid;
BEGIN
  IF _rating < 0 OR _rating > 3 THEN RAISE EXCEPTION 'invalid rating'; END IF;
  IF EXISTS (SELECT 1 FROM reviews WHERE id = _review_id) THEN RETURN false; END IF;
  UPDATE cards SET ease = _ease, interval_days = _interval_days, due_at = _due_at, reps = _reps
    WHERE id = _card_id AND user_id = auth.uid()
    RETURNING route_id INTO _route;
  IF _route IS NULL THEN RAISE EXCEPTION 'card not found' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO reviews (id, card_id, route_id, rating, reviewed_at)
    VALUES (_review_id, _card_id, _route, _rating, _reviewed_at);
  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.record_review(uuid, uuid, int, real, int, timestamptz, int, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_review(uuid, uuid, int, real, int, timestamptz, int, timestamptz) TO authenticated;

CREATE INDEX IF NOT EXISTS cards_user_due_idx ON public.cards (user_id, due_at);
CREATE INDEX IF NOT EXISTS reviews_route_time_idx ON public.reviews (route_id, reviewed_at);
CREATE INDEX IF NOT EXISTS sessions_route_time_idx ON public.sessions (route_id, logged_at);
CREATE INDEX IF NOT EXISTS milestones_route_idx ON public.milestones (route_id, position);
CREATE INDEX IF NOT EXISTS checkins_route_day_idx ON public.checkins (route_id, checked_on);