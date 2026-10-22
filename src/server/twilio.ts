import "server-only";
import { sendProblem } from "@/lib/texting";

// Twilio's REST API (SPEC.md §11), called directly so HQ doesn't need Twilio's SDK. Keys come only from
// Railway variables and are never logged. TWILIO_API_BASE points tests at a fake server.

const creds = () => ({ sid: process.env.TWILIO_ACCOUNT_SID?.trim() ?? "", token: process.env.TWILIO_AUTH_TOKEN?.trim() ?? "" });
const host = (name: "api" | "messaging") => (process.env.TWILIO_API_BASE ? `${process.env.TWILIO_API_BASE.replace(/\/$/, "")}/${name}` : `https://${name}.twilio.com`);
export const twilioToken = () => creds().token;
/** HQ's public address, which Twilio calls back (the same one Google sign-in uses). */
export const publicBase = () => (process.env.NEXTAUTH_URL ?? "").trim().replace(/\/$/, "");

type Json = Record<string, unknown>;
async function call(url: string, form?: Record<string, string>): Promise<{ ok: boolean; status: number; json: Json }> {
  const { sid, token } = creds();
  const res = await fetch(url, {
    method: form ? "POST" : "GET",
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: form ? new URLSearchParams(form).toString() : undefined,
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Json;
  return { ok: res.ok, status: res.status, json };
}
const account = (path: string) => `${host("api")}/2010-04-01/Accounts/${encodeURIComponent(creds().sid)}${path}`;

export type SendResult = { ok: true; sid: string; status: string } | { ok: false; error: string };

/** Sends one text from a team member's number. Twilio reports delivery to /api/twilio/status. */
export async function sendSms(o: { from: string; to: string; body: string }): Promise<SendResult> {
  try {
    const r = await call(account("/Messages.json"), { From: o.from, To: o.to, Body: o.body, StatusCallback: `${publicBase()}/api/twilio/status` });
    if (!r.ok) {
      console.error("Twilio send failed", r.status, r.json.code ?? "");
      return { ok: false, error: sendProblem(r.json.code as number, r.status === 401 ? sendProblem(20003) : "") };
    }
    return { ok: true, sid: String(r.json.sid), status: String(r.json.status ?? "queued") };
  } catch {
    return { ok: false, error: "Couldn't reach Twilio. Check your connection and try again." };
  }
}

/** A call recording's audio from Twilio (passing the browser's Range along, so phones can play and seek it). */
export async function fetchRecording(sid: string, range: string | null): Promise<Response> {
  const { sid: account_, token } = creds();
  return fetch(account(`/Recordings/${encodeURIComponent(sid)}.mp3`), {
    headers: { Authorization: `Basic ${Buffer.from(`${account_}:${token}`).toString("base64")}`, ...(range ? { Range: range } : {}) },
    signal: AbortSignal.timeout(30000), cache: "no-store",
  });
}

/** The phone numbers in the Twilio account, for the Texting lines picker. Null when Twilio can't be reached. */
export async function listNumbers(): Promise<{ number: string; name: string }[] | null> {
  try {
    const r = await call(`${account("/IncomingPhoneNumbers.json")}?PageSize=100`);
    if (!r.ok) return null;
    return ((r.json.incoming_phone_numbers as Json[] | undefined) ?? []).map((n) => ({ number: String(n.phone_number), name: String(n.friendly_name ?? "") }));
  } catch {
    return null;
  }
}

/**
 * Points a number's texts and calls at HQ: its incoming-text and incoming-call webhooks, and the Messaging
 * Service it's in (registered for A2P 10DLC) set to use the number's own webhook. Returns what still needs doing.
 */
export async function connectNumber(number: string): Promise<{ ok: boolean; message: string }> {
  try {
    const base = publicBase();
    if (!/^https:\/\//.test(base)) return { ok: false, message: "HQ's address (NEXTAUTH_URL) isn't an https address, so Twilio can't reach it." };
    const found = await call(`${account("/IncomingPhoneNumbers.json")}?PhoneNumber=${encodeURIComponent(number)}`);
    if (!found.ok) return { ok: false, message: sendProblem(found.status === 401 ? 20003 : null, "Couldn't look up the number in Twilio.") };
    const pn = ((found.json.incoming_phone_numbers as Json[] | undefined) ?? [])[0];
    if (!pn) return { ok: false, message: `${number} isn't a number in this Twilio account.` };
    const upd = await call(account(`/IncomingPhoneNumbers/${pn.sid}.json`), {
      SmsUrl: `${base}/api/twilio/sms`, SmsMethod: "POST", VoiceUrl: `${base}/api/twilio/voice`, VoiceMethod: "POST",
    });
    if (!upd.ok) return { ok: false, message: "Twilio didn't accept the new settings for the number." };
    // The Messaging Service would otherwise handle incoming texts itself.
    const services = await call(`${host("messaging")}/v1/Services?PageSize=50`);
    for (const s of ((services.json.services as Json[] | undefined) ?? [])) {
      const nums = await call(`${host("messaging")}/v1/Services/${s.sid}/PhoneNumbers?PageSize=100`);
      if (((nums.json.phone_numbers as Json[] | undefined) ?? []).some((n) => n.sid === pn.sid || n.phone_number === number)) {
        const set = await call(`${host("messaging")}/v1/Services/${s.sid}`, { UseInboundWebhookOnNumber: "true" });
        return set.ok ? { ok: true, message: "Connected: texts and calls to this number now come into HQ." }
          : { ok: false, message: `Number connected, but set the Messaging Service "${s.friendly_name}" → Integration → "Defer to sender's webhook" in Twilio.` };
      }
    }
    return { ok: true, message: "Connected. Note: this number isn't in a Messaging Service yet; add it to the one registered for A2P 10DLC (Sender Pool)." };
  } catch {
    return { ok: false, message: "Couldn't reach Twilio. Try again." };
  }
}
