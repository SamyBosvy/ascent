CREATE OR REPLACE FUNCTION public.activity_strip(_today date, _timezone text)
RETURNS TABLE(day date, reviews bigint, minutes bigint, checkins bigint)
LANGUAGE sql STABLE SET search_path = public AS $$
 WITH days AS (SELECT generate_series(_today - 6, _today, interval '1 day')::date AS day),
 rv AS (SELECT (v.reviewed_at AT TIME ZONE _timezone)::date AS day, count(*) AS n FROM reviews v JOIN routes r ON r.id = v.route_id WHERE r.deleted_at IS NULL AND v.reviewed_at >= ((_today - 6)::timestamp AT TIME ZONE _timezone) AND v.reviewed_at < ((_today + 1)::timestamp AT TIME ZONE _timezone) GROUP BY 1),
 ss AS (SELECT (s.logged_at AT TIME ZONE _timezone)::date AS day, sum(s.minutes) AS n FROM sessions s JOIN routes r ON r.id = s.route_id WHERE r.deleted_at IS NULL AND s.logged_at >= ((_today - 6)::timestamp AT TIME ZONE _timezone) AND s.logged_at < ((_today + 1)::timestamp AT TIME ZONE _timezone) GROUP BY 1),
 cc AS (SELECT c.checked_on AS day, count(*) AS n FROM checkins c JOIN routes r ON r.id = c.route_id WHERE r.deleted_at IS NULL AND c.checked_on BETWEEN _today - 6 AND _today GROUP BY 1)
 SELECT d.day, coalesce(rv.n,0), coalesce(ss.n,0), coalesce(cc.n,0) FROM days d LEFT JOIN rv USING(day) LEFT JOIN ss USING(day) LEFT JOIN cc USING(day) ORDER BY d.day;
$$;
REVOKE ALL ON FUNCTION public.activity_strip(date,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activity_strip(date,text) TO authenticated, service_role;