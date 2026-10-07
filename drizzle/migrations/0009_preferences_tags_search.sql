ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS week_start smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS daily_goal integer;
ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_theme_check CHECK (theme IN ('light','dark','system')),
  ADD CONSTRAINT user_settings_week_start_check CHECK (week_start IN (0,1)),
  ADD CONSTRAINT user_settings_daily_goal_check CHECK (daily_goal IS NULL OR daily_goal BETWEEN 1 AND 1000),
  ADD CONSTRAINT user_settings_timezone_check CHECK (timezone IS NULL OR char_length(timezone) <= 64);

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS search tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple'::regconfig, coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple'::regconfig, coalesce(body, '')), 'B')
  ) STORED;
CREATE INDEX IF NOT EXISTS notes_tags_gin ON public.notes USING gin (tags);
CREATE INDEX IF NOT EXISTS notes_search_gin ON public.notes USING gin (search);

-- Tags are normalised by the database: trimmed, lowercase, unique, max 10 of max 30 chars.
CREATE OR REPLACE FUNCTION public.normalize_note_tags()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE t text[];
BEGIN
  SELECT coalesce(array_agg(x ORDER BY ord), '{}') INTO t FROM (
    SELECT x, min(ord) AS ord FROM (
      SELECT lower(btrim(v)) AS x, ord FROM unnest(coalesce(NEW.tags, '{}')) WITH ORDINALITY AS u(v, ord)
    ) s WHERE x <> '' GROUP BY x
  ) d;
  IF cardinality(t) > 10 THEN RAISE EXCEPTION 'A note can have at most 10 tags'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(t) x WHERE char_length(x) > 30) THEN RAISE EXCEPTION 'Tags can be at most 30 characters'; END IF;
  NEW.tags := t;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notes_normalize_tags ON public.notes;
CREATE TRIGGER notes_normalize_tags BEFORE INSERT OR UPDATE OF tags ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.normalize_note_tags();

CREATE OR REPLACE FUNCTION public.note_tags()
RETURNS TABLE (tag text, uses integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT t, count(*)::int FROM notes n JOIN routes r ON r.id = n.route_id AND r.deleted_at IS NULL, unnest(n.tags) t
  GROUP BY t ORDER BY count(*) DESC, t
$$;
REVOKE EXECUTE ON FUNCTION public.note_tags() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.note_tags() TO authenticated;