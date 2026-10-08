import { toast } from "sonner";
import { localDate, type RouteAgg } from "./data";
import { queryClientForSync, queueWrite } from "./sync";

/** Optimistically mark today's check-in in the cached route stats and check-in history. */
function applyLocal(routeId: string, day: string, checked: boolean) {
  const qc = queryClientForSync();
  if (!qc) return;
  qc.setQueriesData<Map<string, RouteAgg>>({ queryKey: ["route-stats"] }, (m) => {
    if (!m) return m;
    const a = m.get(routeId);
    if (!a) return m;
    const next = new Map(m);
    const delta = checked === !!a.checked_today ? 0 : checked ? 1 : -1;
    next.set(routeId, { ...a, checked_today: checked, checkins_30: Math.max(0, Number(a.checkins_30 ?? 0) + delta), checkins_week: Math.max(0, Number(a.checkins_week ?? 0) + delta) } as RouteAgg);
    return next;
  });
  qc.setQueriesData<Map<string, string[]>>({ queryKey: ["checkins", "history"] }, (m) => {
    if (!m) return m;
    const next = new Map(m);
    const days = (next.get(routeId) ?? []).filter((d) => d !== day);
    next.set(routeId, checked ? [...days, day].sort() : days);
    return next;
  });
}

async function set(routeId: string, day: string, checked: boolean) {
  applyLocal(routeId, day, checked);
  await queueWrite({ kind: checked ? "checkin_add" : "checkin_del", data: { route_id: routeId, checked_on: day } });
}

/** Check in for today, or — if already checked in today — remove it with an Undo toast. Works offline. */
export async function toggleCheckin(routeId: string, checkedToday: boolean, _refresh?: () => void) {
  const today = localDate();
  try {
    if (!checkedToday) {
      await set(routeId, today, true);
      toast.success("Checked in.");
      return;
    }
    await set(routeId, today, false);
    toast("Check-in removed", {
      duration: 8000,
      action: { label: "Undo", onClick: () => void set(routeId, today, true) },
    });
  } catch (e) {
    toast.error(`Couldn't save the check-in: ${(e as Error).message}`);
  }
}
