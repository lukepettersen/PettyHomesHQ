import "server-only";
import { sendProblem } from "@/lib/texting";

// Twilio's REST API (SPEC.md §11), called directly so HQ doesn't need Twilio's SDK. Keys come only from
// Railway variables and are never logged. TWILIO_API_BASE points tests at a fake server.

const creds = () => ({ sid: process.env.TWILIO_ACCOUNT_SID?.trim() ?? "", token: process.env.TWILIO_AUTH_TOKEN?.trim() ?? "" });
const host = (name: "api" | "messaging" | "conversations" | "mcs") => (process.env.TWILIO_API_BASE ? `${process.env.TWILIO_API_BASE.replace(/\/$/, "")}/${name}` : name === "mcs" ? "https://mcs.us1.twilio.com" : `https://${name}.twilio.com`);
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
export async function sendSms(o: { from: string; to: string; body: string; media?: string[] }): Promise<SendResult> {
  try {
    // Photos go as MediaUrl (public addresses Twilio downloads); then it's a picture text (MMS).
    const r = await callForm(account("/Messages.json"), formOf({ From: o.from, To: o.to, ...(o.body ? { Body: o.body } : {}), ...(o.media?.length ? { MediaUrl: o.media } : {}), StatusCallback: `${publicBase()}/api/twilio/status` }));
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
export async function listNumbers(): Promise<{ number: string; name: string; mms: boolean }[] | null> {
  try {
    const r = await call(`${account("/IncomingPhoneNumbers.json")}?PageSize=100`);
    if (!r.ok) return null;
    return ((r.json.incoming_phone_numbers as Json[] | undefined) ?? []).map((n) => ({ number: String(n.phone_number), name: String(n.friendly_name ?? ""), mms: !!(n.capabilities as Json | undefined)?.mms }));
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

// ---------- Group texting: Twilio Conversations (owner request 2026-10-22) ----------
// With an Address Configuration on a team number, Twilio keeps each group text (and each one-to-one chat) as a
// Conversation and posts every new message to HQ's /api/twilio/conversation webhook.

const conv = (path: string) => `${host("conversations")}/v1${path}`;
const formOf = (o: Record<string, string | string[]>) => {
  const f = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
};
async function callForm(url: string, form: URLSearchParams, method = "POST"): Promise<{ ok: boolean; status: number; json: Json }> {
  const { sid, token } = creds();
  const res = await fetch(url, {
    method, headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: method === "DELETE" ? undefined : form.toString(), signal: AbortSignal.timeout(15000), cache: "no-store",
  });
  return { ok: res.ok, status: res.status, json: (await res.json().catch(() => ({}))) as Json };
}
const problem = (r: { status: number; json: Json }, what: string) => (r.status === 401 ? sendProblem(20003) : `${what} (Twilio said: ${String(r.json.message ?? r.status).slice(0, 160)})`);

/** Turns group texting on or off for one number (its Address Configuration). */
export async function setGroupAddress(number: string, on: boolean, webhookUrl: string): Promise<{ ok: boolean; message: string }> {
  try {
    const list = await call(`${conv("/Configuration/Addresses")}?Type=sms&PageSize=50`);
    if (!list.ok) return { ok: false, message: problem(list, "Couldn't read Twilio's group texting settings.") };
    const mine = ((list.json.address_configurations as Json[] | undefined) ?? []).filter((a) => a.address === number);
    if (!on) {
      for (const a of mine) await callForm(conv(`/Configuration/Addresses/${a.sid}`), new URLSearchParams(), "DELETE");
      return { ok: true, message: "Group texting off." };
    }
    if (mine.length) return { ok: true, message: "Group texting on." };
    const r = await callForm(conv("/Configuration/Addresses"), formOf({
      Type: "sms", Address: number, FriendlyName: "PettyHomes HQ", "AutoCreation.Enabled": "true", "AutoCreation.Type": "webhook",
      "AutoCreation.WebhookUrl": webhookUrl, "AutoCreation.WebhookMethod": "post", "AutoCreation.WebhookFilters": ["onMessageAdded"],
    }));
    return r.ok ? { ok: true, message: "Group texting on." } : { ok: false, message: problem(r, "Twilio didn't turn on group texting for this number.") };
  } catch {
    return { ok: false, message: "Couldn't reach Twilio. Try again." };
  }
}

export async function conversationParticipants(sid: string) {
  const r = await call(`${conv(`/Conversations/${encodeURIComponent(sid)}/Participants`)}?PageSize=50`);
  if (!r.ok) throw new Error(`Twilio participants ${r.status}`);
  return (r.json.participants as { identity?: string | null; messaging_binding?: Record<string, string | null> | null }[] | undefined) ?? [];
}

/** Our sending identity in a group text: a participant that shows as our number to everyone else. */
export async function addGroupSender(sid: string, ourNumber: string): Promise<string> {
  const identity = `hq:${ourNumber}`;
  const r = await callForm(conv(`/Conversations/${encodeURIComponent(sid)}/Participants`), formOf({ Identity: identity, "MessagingBinding.ProjectedAddress": ourNumber }));
  if (!r.ok && r.status !== 409) throw new Error(problem(r, "Twilio didn't let HQ join the group text."));
  return identity;
}

/** A new group text: the people (E.164) and us, with HQ's webhook for replies. Returns the Conversation SID. */
export async function createGroup(o: { ourNumber: string; numbers: string[]; name: string; webhookUrl: string }): Promise<string> {
  const c = await callForm(conv("/Conversations"), formOf({ FriendlyName: o.name.slice(0, 250) }));
  if (!c.ok) throw new Error(problem(c, "Twilio didn't start the group text."));
  const sid = String(c.json.sid);
  for (const n of o.numbers) {
    const p = await callForm(conv(`/Conversations/${sid}/Participants`), formOf({ "MessagingBinding.Address": n }));
    if (!p.ok) throw new Error(problem(p, `Twilio couldn't add ${n} to the group text.`));
  }
  await addGroupSender(sid, o.ourNumber);
  const w = await callForm(conv(`/Conversations/${sid}/Webhooks`), formOf({ Target: "webhook", "Configuration.Url": o.webhookUrl, "Configuration.Method": "post", "Configuration.Filters": ["onMessageAdded"] }));
  if (!w.ok) throw new Error(problem(w, "Twilio didn't set up replies for the group text."));
  return sid;
}

export async function postGroupMessage(sid: string, author: string, body: string, mediaSid?: string): Promise<SendResult> {
  try {
    const r = await callForm(conv(`/Conversations/${encodeURIComponent(sid)}/Messages`), formOf({ Author: author, ...(body ? { Body: body } : {}), ...(mediaSid ? { MediaSid: mediaSid } : {}) }));
    if (!r.ok) { console.error("Twilio group send failed", r.status, r.json.code ?? ""); return { ok: false, error: problem(r, "Twilio didn't send the group text.") }; }
    return { ok: true, sid: String(r.json.sid), status: "sent" };
  } catch {
    return { ok: false, error: "Couldn't reach Twilio. Check your connection and try again." };
  }
}

/** Closing a Conversation hands its numbers back to normal texting (used when group texting is turned off). */
export async function closeConversation(sid: string) {
  await callForm(conv(`/Conversations/${encodeURIComponent(sid)}`), formOf({ State: "closed" })).catch(() => null);
}

/** A photo for a group text: uploaded to the Conversation's media store; returns its Media SID. */
export async function uploadGroupPhoto(conversationSid: string, bytes: Uint8Array, type: string, filename: string): Promise<string> {
  const c = await call(conv(`/Conversations/${encodeURIComponent(conversationSid)}`));
  const service = c.ok ? String(c.json.chat_service_sid ?? "") : "";
  if (!service) throw new Error(problem(c, "Twilio didn't find the group text to add the photo to."));
  const { sid, token } = creds();
  const res = await fetch(`${host("mcs")}/v1/Services/${service}/Media`, {
    method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": type, "X-Twilio-Filename": filename },
    body: Buffer.from(bytes), signal: AbortSignal.timeout(30000), cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok || !json.sid) throw new Error(problem({ status: res.status, json }, "Twilio didn't take the photo."));
  return String(json.sid);
}

/** A received photo's bytes from Twilio (plain texts' MediaUrl, or a Conversations media item). */
export async function fetchTextMedia(m: { url?: string; service?: string; sid?: string }): Promise<Response | null> {
  const { sid, token } = creds();
  const url = m.url ?? (m.service && m.sid ? `${host("mcs")}/v1/Services/${m.service}/Media/${m.sid}/Content` : "");
  // Only Twilio's own addresses get the account's keys.
  if (!/^https:\/\/(api|mcs\.us1)\.twilio\.com\//.test(url) && !(process.env.TWILIO_API_BASE && url.startsWith(process.env.TWILIO_API_BASE))) return null;
  return fetch(url, { headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` }, signal: AbortSignal.timeout(30000), cache: "no-store" }).catch(() => null);
}

/** Calling from the browser: an API key (its secret is shown once) and a TwiML App whose voice address is HQ's. */
export async function createApiKey(name: string): Promise<{ sid: string; secret: string }> {
  const r = await callForm(account("/Keys.json"), formOf({ FriendlyName: name }));
  if (!r.ok || !r.json.sid || !r.json.secret) throw new Error(problem(r, "Couldn't set up calling"));
  return { sid: String(r.json.sid), secret: String(r.json.secret) };
}
export async function saveVoiceApp(appSid: string | null, voiceUrl: string): Promise<string> {
  const r = await callForm(account(appSid ? `/Applications/${encodeURIComponent(appSid)}.json` : "/Applications.json"), formOf({ FriendlyName: "Petty Homes HQ calling", VoiceUrl: voiceUrl, VoiceMethod: "POST" }));
  if (!r.ok || !r.json.sid) throw new Error(problem(r, "Couldn't set up calling"));
  return String(r.json.sid);
}
export const twilioAccountSid = () => creds().sid;
