// Twilio webhook signatures (server only: uses Node crypto). Unit tested in texting.test.ts.
import { createHmac, timingSafeEqual } from "node:crypto";

/** Twilio's request signature: HMAC-SHA1 of the URL plus each POST field (sorted by name), base64. */
export function twilioSignature(url: string, params: Record<string, string>, authToken: string): string {
  const data = Object.keys(params).sort().reduce((s, k) => s + k + params[k], url);
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
}

export function validTwilioRequest(url: string, params: Record<string, string>, authToken: string, signature: string | null): boolean {
  if (!signature || !authToken) return false;
  const a = Buffer.from(twilioSignature(url, params, authToken)), b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
