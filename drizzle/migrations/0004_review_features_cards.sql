ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS buried_until date;
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz;
UPDATE public.cards c SET last_reviewed_at = v.m FROM (SELECT card_id, max(reviewed_at) m FROM public.reviews GROUP BY card_id) v WHERE v.card_id = c.id;
CREATE INDEX IF NOT EXISTS reviews_card_idx ON public.reviews (card_id, reviewed_at);

CREATE TABLE public.user_settings (
  user_id uuid PRIMARY KEY DEFAULT auth.uid(),
  new_per_day integer NOT NULL DEFAULT 20 CHECK (new_per_day >= 0 AND new_per_day <= 1000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own settings" ON public.user_settings FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.record_review(_review_id uuid, _card_id uuid, _rating integer, _ease real, _interval_days integer, _due_at timestamptz, _reps integer, _reviewed_at timestamptz)
RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _route uuid;
BEGIN
  IF _rating < 0 OR _rating > 3 THEN RAISE EXCEPTION 'invalid rating'; END IF;
  IF EXISTS (SELECT 1 FROM reviews WHERE id = _review_id) THEN RETURN false; END IF;
  UPDATE cards SET ease = _ease, interval_days = _interval_days, due_at = _due_at, reps = _reps,
      last_reviewed_at = greatest(coalesce(last_reviewed_at, _reviewed_at), _reviewed_at)
    WHERE id = _card_id AND user_id = auth.uid()
    RETURNING route_id INTO _route;
  IF _route IS NULL THEN RAISE EXCEPTION 'card not found' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO reviews (id, card_id, route_id, rating, reviewed_at)
    VALUES (_review_id, _card_id, _route, _rating, _reviewed_at);
  RETURN true;
END $$;

-- Atomic, idempotent undo: deletes the review and restores the previous schedule together.
CREATE OR REPLACE FUNCTION public.undo_review(_review_id uuid, _card_id uuid, _ease real, _interval_days integer, _due_at timestamptz, _reps integer)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  DELETE FROM reviews WHERE id = _review_id AND card_id = _card_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE cards SET ease = _ease, interval_days = _interval_days, due_at = _due_at, reps = _reps,
      last_reviewed_at = (SELECT max(reviewed_at) FROM reviews WHERE card_id = _card_id)
    WHERE id = _card_id AND user_id = auth.uid();
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.undo_review(uuid, uuid, real, integer, timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_review(uuid, uuid, real, integer, timestamptz, integer) TO authenticated;

-- Cards whose very first review happened at/after _since (new cards studied today).
CREATE OR REPLACE FUNCTION public.new_cards_reviewed_since(_since timestamptz)
RETURNS integer LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT count(*)::int FROM (SELECT card_id FROM reviews GROUP BY card_id HAVING min(reviewed_at) >= _since) x
$$;
REVOKE ALL ON FUNCTION public.new_cards_reviewed_since(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.new_cards_reviewed_since(timestamptz) TO authenticated;

-- Move cards (and their review history) to another route in one step.
CREATE OR REPLACE FUNCTION public.move_cards(_ids uuid[], _route uuid)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM routes WHERE id = _route AND user_id = auth.uid() AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'route not found' USING ERRCODE = 'P0002';
  END IF;
  UPDATE cards SET route_id = _route WHERE id = ANY(_ids) AND user_id = auth.uid();
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE reviews SET route_id = _route WHERE card_id = ANY(_ids) AND user_id = auth.uid();
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.move_cards(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_cards(uuid[], uuid) TO authenticated;

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
    (SELECT count(*) FROM cards c WHERE c.route_id = r.id AND c.due_at <= now() AND c.suspended_at IS NULL AND (c.buried_until IS NULL OR c.buried_until <= _today))::int,
    (SELECT count(*) FROM reviews v WHERE v.route_id = r.id AND v.reviewed_at > _since_ts)::int,
    (SELECT count(*) FROM reviews v WHERE v.route_id = r.id AND v.reviewed_at > _since_ts AND v.rating >= 2)::int,
    (SELECT max(v.reviewed_at) FROM reviews v WHERE v.route_id = r.id AND v.reviewed_at > _since_ts),
    (SELECT count(*) FROM checkins k WHERE k.route_id = r.id AND k.checked_on >= _since_date)::int,
    (SELECT count(*) FROM checkins k WHERE k.route_id = r.id AND k.checked_on >= _week_date)::int,
    EXISTS (SELECT 1 FROM checkins k WHERE k.route_id = r.id AND k.checked_on = _today),
    (SELECT max(k.checked_on) FROM checkins k WHERE k.route_id = r.id)
  FROM routes r WHERE r.deleted_at IS NULL
$$;