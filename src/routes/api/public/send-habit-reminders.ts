import { createFileRoute } from "@tanstack/react-router";

const digest = (value: string) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));

async function safeEqual(expected: string, supplied: string) {
  const [a, b] = await Promise.all([digest(expected), digest(supplied)]);
  let diff = 0;
  const left = new Uint8Array(a), right = new Uint8Array(b);
  for (let i = 0; i < left.length; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

export async function handleSendHabitReminders(request: Request) {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!supplied) return new Response("Unauthorized", { status: 401 });
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("scheduler_tokens").select("token").eq("name", "habit-reminders").maybeSingle();
  const candidates = [(data as { token?: string } | null)?.token, process.env["LOVABLE_CRON_SECRET"]].filter((v): v is string => !!v);
  let ok = false;
  for (const c of candidates) if (await safeEqual(c, supplied)) ok = true;
  if (!ok) return new Response("Unauthorized", { status: 401 });
  const seed = process.env["VAPID_KEY_SEED"];
  const subject = process.env["VAPID_SUBJECT"] ?? (process.env["OWNER_EMAIL"] ? `mailto:${process.env["OWNER_EMAIL"]}` : undefined);
  if (!seed || !subject) return new Response("Push configuration unavailable", { status: 503 });
  const [{ sendHabitReminders }, { deriveVapid }] = await Promise.all([import("@/lib/sendHabitReminders"), import("@/lib/vapid")]);
  const counts = await sendHabitReminders(supabaseAdmin, await deriveVapid(seed, subject), new Date());
  return Response.json(counts);
}

export const Route = createFileRoute("/api/public/send-habit-reminders")({
  server: { handlers: { POST: ({ request }) => handleSendHabitReminders(request) } },
});
