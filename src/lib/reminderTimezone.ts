import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isValidTimeZone } from "./time";

/** Explicit reminder actions only; conditional writes preserve concurrent preference edits. */
export async function ensureReminderTimezone(qc: QueryClient): Promise<string | null> {
  let timezone: string;
  try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return null; }
  if (!timezone || !isValidTimeZone(timezone)) return null;
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error("Please sign in again.");
  const userId = auth.user.id;
  const table = () => supabase.from("user_settings");
  const existing = await table().select("timezone").eq("user_id", userId).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data?.timezone) return existing.data.timezone;
  if (!existing.data) {
    const created = await table().upsert({ user_id: userId, timezone }, { onConflict: "user_id", ignoreDuplicates: true });
    if (created.error) throw new Error(created.error.message);
  }
  const updated = await table().update({ timezone }).eq("user_id", userId).is("timezone", null);
  if (updated.error) throw new Error(updated.error.message);
  const saved = await table().select("timezone").eq("user_id", userId).single();
  if (saved.error) throw new Error(saved.error.message);
  await qc.invalidateQueries({ queryKey: ["user-settings"] });
  return saved.data.timezone;
}