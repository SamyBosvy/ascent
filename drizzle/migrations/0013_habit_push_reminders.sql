CREATE TABLE public.push_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL DEFAULT auth.uid(),
 endpoint text NOT NULL UNIQUE,
 p256dh text NOT NULL,
 auth text NOT NULL,
 user_agent text,
 created_at timestamptz NOT NULL DEFAULT now(),
 last_success_at timestamptz,
 failure_count integer NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_push_select ON public.push_subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY own_push_insert ON public.push_subscriptions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY own_push_delete ON public.push_subscriptions FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE INDEX push_subscriptions_user ON public.push_subscriptions(user_id);
ALTER TABLE public.routes ADD COLUMN reminder_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.routes ADD COLUMN reminder_time time NOT NULL DEFAULT '19:00';
CREATE FUNCTION public.validate_habit_reminder() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF NEW.reminder_enabled AND NEW.type <> 'habit' THEN RAISE EXCEPTION 'Reminders are only available for habits'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER validate_habit_reminder BEFORE INSERT OR UPDATE ON public.routes FOR EACH ROW EXECUTE FUNCTION public.validate_habit_reminder();
CREATE TABLE public.reminder_log (
 route_id uuid NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
 user_id uuid NOT NULL,
 local_date date NOT NULL,
 sent_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (route_id, local_date)
);
GRANT SELECT ON public.reminder_log TO authenticated;
GRANT ALL ON public.reminder_log TO service_role;
ALTER TABLE public.reminder_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_reminder_select ON public.reminder_log FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE FUNCTION public.save_push_subscription(_endpoint text, _p256dh text, _auth text, _user_agent text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
 IF _endpoint !~ '^https://' OR length(_endpoint) > 4096 OR length(_p256dh) > 200 OR length(_auth) > 200 OR length(_p256dh) < 1 OR length(_auth) < 1 THEN RAISE EXCEPTION 'Invalid subscription'; END IF;
 INSERT INTO public.push_subscriptions(user_id, endpoint, p256dh, auth, user_agent)
 VALUES(uid, _endpoint, _p256dh, _auth, left(_user_agent, 512))
 ON CONFLICT(endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent
 WHERE push_subscriptions.user_id = uid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Subscription unavailable' USING ERRCODE = '42501'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.save_push_subscription(text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(text,text,text,text) TO authenticated;
