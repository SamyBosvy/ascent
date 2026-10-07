import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchPaged, localDate, type Card, type Review } from "./data";
import { addDays } from "./time";

export function tomorrow() {
  return addDays(localDate(), 1);
}

type Patch = { suspended_at?: string | null; buried_until?: string | null };

export async function patchCards(ids: string[], patch: Patch) {
  const { error } = await supabase.from("cards").update(patch).in("id", ids);
  if (error) throw new Error(error.message);
}

/**
 * Suspend / unsuspend / bury with an Undo toast. `onUndo` runs after the undo is saved.
 */
export async function setCardsState(
  ids: string[],
  action: "suspend" | "unsuspend" | "bury",
  refresh: () => void,
  onUndo?: () => void,
) {
  const patch: Patch =
    action === "suspend" ? { suspended_at: new Date().toISOString() } : action === "unsuspend" ? { suspended_at: null } : { buried_until: tomorrow() };
  const undoPatch: Patch = action === "suspend" ? { suspended_at: null } : action === "unsuspend" ? { suspended_at: new Date().toISOString() } : { buried_until: null };
  try {
    await patchCards(ids, patch);
  } catch (e) {
    toast.error(`Couldn't update: ${(e as Error).message}`);
    return false;
  }
  refresh();
  const n = ids.length === 1 ? "Card" : `${ids.length} cards`;
  const msg = action === "suspend" ? `${n} suspended.` : action === "unsuspend" ? `${n} unsuspended.` : `${n} buried until tomorrow.`;
  toast(msg, {
    duration: 8000,
    action: {
      label: "Undo",
      onClick: async () => {
        try {
          await patchCards(ids, undoPatch);
          onUndo?.();
        } catch (e) {
          toast.error(`Couldn't undo: ${(e as Error).message}`);
        }
        refresh();
      },
    },
  });
  return true;
}

/**
 * Delete immediately, keeping a snapshot of the card and its review history in memory.
 * Undo re-inserts the card (same id and schedule) and then its reviews (same ids).
 */
export async function deleteCardWithUndo(card: Card, refresh: () => void) {
  let reviews: Review[];
  try {
    reviews = await fetchPaged<Review>((a, b) => supabase.from("reviews").select("*").eq("card_id", card.id).order("reviewed_at").order("id").range(a, b));
  } catch (e) {
    toast.error(`Couldn't delete: ${(e as Error).message}`);
    return false;
  }
  const { error } = await supabase.from("cards").delete().eq("id", card.id);
  if (error) { toast.error(`Couldn't delete: ${error.message}`); return false; }
  refresh();
  toast("Card deleted.", {
    duration: 8000,
    action: {
      label: "Undo",
      onClick: async () => {
        const { error: e1 } = await supabase.from("cards").insert({
          id: card.id, route_id: card.route_id, front: card.front, back: card.back, example: card.example, pronunciation: card.pronunciation,
          ease: card.ease, interval_days: card.interval_days, reps: card.reps, due_at: card.due_at, created_at: card.created_at,
          suspended_at: card.suspended_at, buried_until: card.buried_until, last_reviewed_at: card.last_reviewed_at,
        });
        if (e1) { toast.error(`Couldn't restore the card: ${e1.message}`); refresh(); return; }
        for (let i = 0; i < reviews.length; i += 500) {
          const { error: e2 } = await supabase.from("reviews").insert(reviews.slice(i, i + 500).map(({ user_id: _u, ...r }) => r));
          if (e2) { toast.error(`Card restored, but some review history couldn't be: ${e2.message}`); break; }
        }
        refresh();
      },
    },
  });
  return true;
}
