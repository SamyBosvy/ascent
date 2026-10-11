import { supabase } from "@/integrations/supabase/client";
import { serviceWorkerRefused } from "./pwa";
import { getVapidPublicKey } from "./push.functions";
import { validPushEndpoint } from "./habitReminders";

export type PushState = "loading" | "enabled" | "available" | "blocked" | "unsupported" | "install" | "host-unavailable";
export async function pushState(): Promise<PushState> {
  if (serviceWorkerRefused()) return "host-unavailable";
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (ios && !window.matchMedia("(display-mode: standalone)").matches) return "install";
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration?.active) return "host-unavailable";
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return "available";
  const { data, error } = await supabase.from("push_subscriptions").select("id").eq("endpoint", subscription.endpoint).maybeSingle();
  if (error) throw new Error("Notification status could not be read.");
  return data ? "enabled" : "available";
}
export async function saveSubscription(subscription: Pick<PushSubscription, "toJSON">) {
  const json = subscription.toJSON();
  if (!json.endpoint || !validPushEndpoint(json.endpoint) || !json.keys?.["p256dh"] || !json.keys["auth"]) throw new Error("This notification subscription is not supported.");
  const { error } = await supabase.rpc("save_push_subscription", { _endpoint: json.endpoint, _p256dh: json.keys["p256dh"], _auth: json.keys["auth"], _user_agent: navigator.userAgent });
  if (error) throw new Error(error.message);
}
export async function deleteSubscription(endpoint: string) {
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) throw new Error(error.message);
}
function decodeKey(value: string) {
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));
}
/** Invoked only by the Enable button: no permission prompt during status reads. */
export async function enablePush() {
  // Keep permission request in the original tap's task (Safari requires user activation).
  if (serviceWorkerRefused() || !("Notification" in window) || !("PushManager" in window)) throw new Error("Notifications are unavailable on this host.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return pushState();
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration?.active) throw new Error("The notification worker is not ready. Reopen the published app.");
  const { publicKey } = await getVapidPublicKey();
  const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(publicKey) });
  try { await saveSubscription(subscription); } catch (error) { await subscription.unsubscribe(); throw error; }
  return "enabled" as const;
}
export async function disablePush() {
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await deleteSubscription(subscription.endpoint);
    await subscription.unsubscribe();
  }
  return pushState();
}