export type InstallPlatform = "ios-safari" | "ios-other" | "android-chrome" | "samsung" | "firefox-android" | "firefox-desktop" | "desktop" | "other";

export function installPlatform(userAgent: string, touchPoints = 0): InstallPlatform {
  const ios = /iPad|iPhone|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && touchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent) || !/Safari/i.test(userAgent) ? "ios-other" : "ios-safari";
  if (/SamsungBrowser/i.test(userAgent)) return "samsung";
  if (/Firefox/i.test(userAgent)) return /Android/i.test(userAgent) ? "firefox-android" : "firefox-desktop";
  if (/Android/i.test(userAgent) && /Chrome/i.test(userAgent)) return "android-chrome";
  if (/Chrome|Edg\//i.test(userAgent)) return "desktop";
  return "other";
}

export function isInstalled(standalone: boolean, navigatorStandalone?: boolean) {
  return standalone || navigatorStandalone === true;
}

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
let pendingPrompt: InstallPrompt | null = null;
let installed = false;
let initialized = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** Capture once at the root so a prompt survives navigation to Settings. */
export function initializeInstall() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const media = window.matchMedia("(display-mode: standalone)");
  const update = () => {
    installed = isInstalled(media.matches, (navigator as Navigator & { standalone?: boolean }).standalone);
    emit();
  };
  update();
  media.addEventListener("change", update);
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    pendingPrompt = event as InstallPrompt;
  });
  window.addEventListener("appinstalled", () => { pendingPrompt = null; update(); });
}

export function subscribeInstalled(listener: () => void) {
  listeners.add(listener);
  initializeInstall();
  return () => { listeners.delete(listener); };
}
export const installedSnapshot = () => installed;
export const installedServerSnapshot = () => false;

/** Must be called directly from the user's tap. Dismissal never hides the button. */
export async function promptInstall(): Promise<boolean> {
  const prompt = pendingPrompt;
  if (!prompt) return false;
  pendingPrompt = null;
  try {
    await prompt.prompt();
    await prompt.userChoice;
    return true;
  } catch {
    return false;
  }
}