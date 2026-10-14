-- lovable-cron-fallback-reviewed: user-chosen reminder times require a 15-minute time-based sender; no event source exists
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ascent-habit-reminders';
SELECT cron.schedule('ascent-habit-reminders', '*/15 * * * *', $job$
  SELECT net.http_post(
    url := 'https://ascenthigher.lovable.app/api/public/send-habit-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (SELECT token FROM public.scheduler_tokens WHERE name = 'habit-reminders')),
    body := '{}'::jsonb);
$job$);