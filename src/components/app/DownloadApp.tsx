import { useState, useSyncExternalStore } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "./ResponsiveDialog";
import { installedServerSnapshot, installedSnapshot, installPlatform, promptInstall, subscribeInstalled, type InstallPlatform } from "@/lib/install";

const steps: Record<InstallPlatform, string[]> = {
  "android-chrome": ["Open Chrome’s ⋮ menu.", "Tap Install app or Add to Home screen.", "Confirm Install or Add."],
  "ios-safari": ["Tap Share in Safari (the square with an upward arrow).", "Scroll down and tap Add to Home Screen.", "Tap Add."],
  "ios-other": ["Open this page in Safari first: copy the address and paste it into Safari.", "Tap Share, then Add to Home Screen.", "Tap Add."],
  samsung: ["Open Samsung Internet’s ☰ menu.", "Tap Add page to, then Home screen (or Add to Home screen).", "Confirm Add or Install."],
  "firefox-android": ["Open Firefox’s ⋮ menu.", "Tap Install or Add to Home screen.", "Confirm Add or Install."],
  "firefox-desktop": ["Open this page in Chrome or Edge; Firefox desktop does not support app installation.", "Click the install icon in the address bar, or open ⋮ and choose Install Ascent / Install this site as an app.", "Confirm Install."],
  desktop: ["Click the install icon in the address bar, or open the ⋮ menu.", "Choose Install Ascent / Install this site as an app (in Chrome, it may be under Cast, save and share).", "Confirm Install."],
  other: ["Open this page in Chrome or Edge on a computer, Chrome on Android, or Safari on iPhone/iPad.", "Choose Install app / Add to Home screen from the browser menu (Share in Safari).", "Confirm Install or Add."],
};

export function DownloadApp() {
  const installed = useSyncExternalStore(subscribeInstalled, installedSnapshot, installedServerSnapshot);
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<InstallPlatform>("other");
  const [busy, setBusy] = useState(false);
  if (installed) return null;

  async function download() {
    if (busy) return;
    setBusy(true);
    try {
      if (await promptInstall()) return;
      setPlatform(installPlatform(navigator.userAgent, navigator.maxTouchPoints));
      setOpen(true);
    } finally { setBusy(false); }
  }

  return <>
    <Button type="button" variant="outline" className="min-h-12 w-full whitespace-normal" disabled={busy} onClick={() => void download()}>
      <Download className="h-5 w-5 shrink-0" aria-hidden />Download the app
    </Button>
    <ResponsiveDialog open={open} onOpenChange={setOpen} title="Download Ascent" description="Add Ascent to your home screen or desktop."
      footer={<Button className="min-h-12 w-full" onClick={() => setOpen(false)}>Done</Button>}>
      <ol className="list-decimal space-y-4 pl-5 pr-1 body-text text-foreground">
        {steps[platform].map((step) => <li key={step} className="pl-1">{step}</li>)}
      </ol>
    </ResponsiveDialog>
  </>;
}