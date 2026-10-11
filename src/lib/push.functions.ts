import { createServerFn } from "@tanstack/react-start";

export const getVapidPublicKey = createServerFn({ method: "GET" }).handler(async () => {
  const seed = process.env["VAPID_KEY_SEED"];
  if (!seed) throw new Error("Notifications are not configured yet.");
  const { deriveVapid } = await import("./vapid");
  return { publicKey: (await deriveVapid(seed, "mailto:unused@example.com")).publicKey };
});