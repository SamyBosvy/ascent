import { p256 } from "@noble/curves/nist.js";

function encode(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""); }
/** The secret seed is stored by the secret service; key material never leaves server handlers. */
export async function deriveVapid(seed: string, subject: string) {
  const privateBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`Ascent VAPID v1:${seed}`)));
  const publicBytes = p256.getPublicKey(privateBytes, false);
  return { privateKey: encode(privateBytes), publicKey: encode(publicBytes), subject };
}