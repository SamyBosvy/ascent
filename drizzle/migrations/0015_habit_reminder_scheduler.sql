-- lovable-cron-fallback-reviewed: user-chosen reminder times require a 15-minute time-based sender; no event source exists
CREATE TABLE IF NOT EXISTS public.scheduler_tokens (name text PRIMARY KEY, token text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON public.scheduler_tokens FROM anon, authenticated;
GRANT ALL ON public.scheduler_tokens TO service_role;
ALTER TABLE public.scheduler_tokens ENABLE ROW LEVEL SECURITY;
INSERT INTO public.scheduler_tokens (name, token) VALUES ('habit-reminders', encode(extensions.gen_random_bytes(32), 'hex')) ON CONFLICT (name) DO NOTHING;
DROP FUNCTION IF EXISTS public.configure_habit_reminder_schedule();
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ascent-habit-reminders';
SELECT cron.schedule('ascent-habit-reminders', '*/15 * * * *', $job$
  SELECT net.http_post(
    url := 'https://project--993c1849-0b89-4816-a04c-7d703d69d4ec.lovable.app/api/public/send-habit-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (SELECT token FROM public.scheduler_tokens WHERE name = 'habit-reminders')),
    body := '{}'::jsonb);
$job$);