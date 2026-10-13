import { getRouteApi } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSubmission } from "@/hooks/use-submission";
import { supabase } from "@/integrations/supabase/client";
import { useUserSettings } from "@/lib/data";
import { getPrefs, setPrefs } from "@/lib/prefs";
import { useOnline } from "@/lib/sync";
import { browserTimeZone } from "@/lib/time";
import { dismissKey, isDismissed, mismatch } from "@/lib/timezoneMismatch";

/** Label-friendly zone name: "Australia/Sydney" → "Sydney". */
function shortName(zone: string) {
  return zone.split("/").pop()!.replace(/_/g, " ");
}

function readDismissed(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Offers to follow the device timezone when it no longer matches the saved one.
 * Lives inside the client-only authenticated shell, so localStorage is safe on first render.
 */
export function TimezoneBanner() {
  const { user } = getRouteApi("/_authenticated").useRouteContext();
  const { data: settings } = useUserSettings();
  const online = useOnline();
  const qc = useQueryClient();
  const device = browserTimeZone();
  const saved = settings?.timezone;
  const [dismissedValue, setDismissedValue] = useState<string | null>(() => readDismissed(dismissKey(user.id)));

  // Pick up a dismissal made in another tab or after a profile change.
  useEffect(() => {
    setDismissedValue(readDismissed(dismissKey(user.id)));
  }, [user.id]);

  const show =
    !!settings &&
    settings.timezone_set &&
    !!saved &&
    mismatch(saved, device) &&
    online &&
    !isDismissed(dismissedValue, device, saved);

  const { submitting, submit } = useSubmission();

  if (!show || !saved) return null;

  function switchTo() {
    return submit(async () => {
      const { error } = await supabase.from("user_settings").update({ timezone: device }).eq("user_id", user.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      setPrefs({ ...getPrefs(), tz: device });
      void qc.invalidateQueries();
      toast.success("Timezone updated.");
    });
  }

  function keep() {
    const value = `${device}|${saved}`;
    try {
      localStorage.setItem(dismissKey(user.id), value);
    } catch {
      /* private mode */
    }
    setDismissedValue(value);
  }

  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-2 border-b bg-muted px-4 py-2 body-text">
      <span>
        Your device is on {device}. Ascent is using {saved}.
      </span>
      <Button className="h-12" disabled={submitting} onClick={() => void switchTo()}>
        Switch to {shortName(device)}
      </Button>
      <Button variant="outline" className="h-12" onClick={keep}>
        Keep {shortName(saved)}
      </Button>
    </div>
  );
}
