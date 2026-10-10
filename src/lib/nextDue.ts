import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { localDate } from "@/lib/data";
import { getPrefs } from "@/lib/prefs";

/** Earliest future due time of a reviewable card on a live route (optionally one route). */
export function useNextDue(route: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["cards", "next-due", route ?? "all"], enabled,
    queryFn: async () => {
      let q = supabase.from("cards").select("due_at, routes!inner(id)").is("routes.archived_at", null).is("routes.deleted_at", null).is("suspended_at", null)
        .or(`buried_until.is.null,buried_until.lte.${localDate()}`).gt("due_at", new Date().toISOString());
      if (route) q = q.eq("route_id", route);
      const { data, error } = await q.order("due_at").limit(1);
      if (error) throw new Error(error.message);
      return data?.[0]?.due_at ?? null;
    },
  });
}

export function nextDueLabel(at: string | null | undefined) {
  return at ? `Next due: ${new Intl.DateTimeFormat(undefined, { timeZone: getPrefs().tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(at))}.` : "Your next scheduled cards will appear here when they’re due.";
}
