import { buildPushPayload, type VapidKeys } from "@block65/webcrypto-web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { reminderEligible, reminderPayload, dateInZone, validPushEndpoint } from "./habitReminders";
import { weekStartOf } from "./time";

async function allRows<T>(query: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = [];
  for (let a = 0; ; a += 500) {
    const result = await query(a, a + 499);
    if (result.error) throw new Error("Reminder data could not be read");
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 500) return rows;
  }
}

export async function sendHabitReminders(db: SupabaseClient<Database>, vapid: VapidKeys, now: Date) {
  const counts = { claimed: 0, delivered: 0, failed: 0 };
  const routes = await allRows((a, b) => db.from("routes").select("*").eq("type", "habit").eq("reminder_enabled", true).eq("status", "active").is("deleted_at", null).is("archived_at", null).order("id").range(a, b));
  for (const route of routes) {
    const { data: settings, error: settingsError } = await db.from("user_settings").select("timezone,week_start").eq("user_id", route.user_id).maybeSingle();
    if (settingsError) throw new Error("Reminder preferences could not be read");
    if (!settings?.timezone) continue; // No guessed device timezone on the server.
    const timezone = settings.timezone;
    let day: string;
    try { day = dateInZone(now, timezone); } catch { continue; }
    const week = weekStartOf(day, settings.week_start === 0 ? 0 : 1);
    const { data: checks, error: checkError } = await db.from("checkins").select("checked_on").eq("route_id", route.id).eq("user_id", route.user_id).gte("checked_on", week).lte("checked_on", day);
    if (checkError) throw new Error("Reminder check-ins could not be read");
    const agg: Database["public"]["Functions"]["route_stats"]["Returns"][number] = {
      route_id: route.id, checked_today: Boolean(checks?.some((c) => c.checked_on === day)), checkins_week: checks?.length ?? 0,
      milestones_total: 0, milestones_done: 0, last_milestone_at: "", minutes: 0, session_count: 0, last_session_at: "", cards_total: 0, cards_mature: 0, cards_due: 0, reviews_recent: 0, reviews_recent_good: 0, last_review_at: "", checkins_recent: 0, last_checkin_on: "",
    };
    if (!reminderEligible(route, agg, now, timezone, false)) continue;
    const subscriptions = await allRows((a, b) => db.from("push_subscriptions").select("*").eq("user_id", route.user_id).order("id").range(a, b));
    if (!subscriptions.length) continue;
    // Atomic pre-send claim: overlapping runs cannot both send. At-most-once attempts,
    // not exactly-once network delivery; a crash after claiming may skip this day.
    const claim = await db.from("reminder_log").insert({ route_id: route.id, user_id: route.user_id, local_date: day, sent_at: now.toISOString() });
    if (claim.error?.code === "23505") continue;
    if (claim.error) throw new Error("Reminder could not be claimed");
    counts.claimed++;
    for (const subscription of subscriptions) {
      let status = 0;
      try {
        if (!validPushEndpoint(subscription.endpoint)) status = 410;
        else {
          const payload = await buildPushPayload({ data: JSON.stringify(reminderPayload(route, day)), options: { ttl: 900 } }, { endpoint: subscription.endpoint, expirationTime: null, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, vapid);
          const response = await fetch(subscription.endpoint, { ...payload, redirect: "error", signal: AbortSignal.timeout(10000) });
          status = response.status;
        }
      } catch { /* Do not log subscription credentials or route names. */ }
      const success = status >= 200 && status < 300;
      let result;
      if (success) {
        counts.delivered++;
        result = await db.from("push_subscriptions").update({ failure_count: 0, last_success_at: now.toISOString() }).eq("id", subscription.id);
      } else {
        counts.failed++;
        result = status === 404 || status === 410 || subscription.failure_count + 1 >= 5
          ? await db.from("push_subscriptions").delete().eq("id", subscription.id)
          : await db.from("push_subscriptions").update({ failure_count: subscription.failure_count + 1 }).eq("id", subscription.id);
      }
      if (result.error) throw new Error("Subscription result could not be saved");
    }
  }
  return counts;
}