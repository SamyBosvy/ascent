import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/send-habit-reminders")({
  server: { handlers: { POST: async ({ request }) => {
    const secret = process.env["LOVABLE_CRON_SECRET"];
    const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "");
    if (!secret || !supplied) return new Response("Unauthorized", { status: 401 });
    const digest = (value: string) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    const [a, b] = await Promise.all([digest(secret), digest(supplied)]);
    let diff = 0;
    const left = new Uint8Array(a), right = new Uint8Array(b);
    for (let i = 0; i < left.length; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
    if (diff) return new Response("Unauthorized", { status: 401 });
    const seed = process.env["VAPID_KEY_SEED"];
    const subject = process.env["VAPID_SUBJECT"] ?? (process.env["OWNER_EMAIL"] ? `mailto:${process.env["OWNER_EMAIL"]}` : undefined);
    if (!seed || !subject) return new Response("Push configuration unavailable", { status: 503 });
    const [{ supabaseAdmin }, { sendHabitReminders }, { deriveVapid }] = await Promise.all([
      import("@/integrations/supabase/client.server"), import("@/lib/sendHabitReminders"), import("@/lib/vapid"),
    ]);
    const counts = await sendHabitReminders(supabaseAdmin, await deriveVapid(seed, subject), new Date());
    return Response.json(counts);
  } } },
});