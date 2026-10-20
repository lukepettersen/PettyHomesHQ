import "server-only";
import { isConnected } from "@/server/integrations";
import { publicBase, twilioToken } from "@/server/twilio";
import { validTwilioRequest } from "@/lib/twilioSig";

/**
 * Reads a webhook from Twilio and checks its signature against HQ's public address, so nobody else can post
 * fake texts or calls. Returns the form fields, or null (answered with 403).
 */
export async function twilioForm(req: Request, path: string): Promise<Record<string, string> | null> {
  if (!isConnected("texting")) return null;
  const form = await req.formData().catch(() => null);
  if (!form) return null;
  const params: Record<string, string> = {};
  form.forEach((v, k) => { if (typeof v === "string") params[k] = v; });
  return validTwilioRequest(`${publicBase()}${path}`, params, twilioToken(), req.headers.get("x-twilio-signature")) ? params : null;
}

export const xml = (body: string, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/xml" } });
export const forbidden = () => new Response("Forbidden", { status: 403 });
