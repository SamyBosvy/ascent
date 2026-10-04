import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { localDate } from "./data";

/** Check in for today, or — if already checked in today — remove it with an Undo toast. */
export async function toggleCheckin(routeId: string, checkedToday: boolean, refresh: () => void) {
  const today = localDate();
  if (!checkedToday) {
    const { error } = await supabase.from("checkins").insert({ route_id: routeId, checked_on: today });
    if (error) { toast.error(`Couldn't check in: ${error.message}`); return; }
    toast.success("Checked in.");
    refresh();
    return;
  }
  const { error } = await supabase.from("checkins").delete().eq("route_id", routeId).eq("checked_on", today);
  if (error) { toast.error(`Couldn't remove the check-in: ${error.message}`); return; }
  refresh();
  toast("Check-in removed", {
    duration: 8000,
    action: {
      label: "Undo",
      onClick: async () => {
        const { error: e } = await supabase.from("checkins").insert({ route_id: routeId, checked_on: today });
        if (e) toast.error(`Couldn't restore the check-in: ${e.message}`);
        refresh();
      },
    },
  });
}
