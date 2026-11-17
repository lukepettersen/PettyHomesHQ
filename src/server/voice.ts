import "server-only";
import { db } from "@/server/db";
import { seal, unseal } from "@/server/crypto";
import { createApiKey, publicBase, saveVoiceApp, twilioAccountSid } from "@/server/twilio";
import { voiceAccessToken, voiceIdentity } from "@/lib/voiceToken";

// Calling from the browser (owner request 2026-10-27). HQ makes its own Twilio API key and TwiML App the first time
// someone opens HQ, so there's nothing to set up by hand. The key secret is stored encrypted.
const KEY = "twilio.voice";
type Saved = { keySid: string; keySecret: string; appSid: string; url: string };
let setup: Promise<Omit<Saved, "url">> | null = null;

async function voiceSetup(): Promise<Omit<Saved, "url">> {
  const url = `${publicBase()}/api/twilio/outbound`;
  const row = await db.appSetting.findUnique({ where: { key: KEY } });
  const saved = (row?.value ?? null) as Saved | null;
  if (saved?.keySid && saved.appSid && saved.url === url) return { keySid: saved.keySid, keySecret: unseal(saved.keySecret), appSid: saved.appSid };
  const key = saved?.keySid ? { sid: saved.keySid, secret: unseal(saved.keySecret) } : await createApiKey("Petty Homes HQ calling");
  const appSid = await saveVoiceApp(saved?.appSid ?? null, url);
  const value: Saved = { keySid: key.sid, keySecret: seal(key.secret), appSid, url };
  await db.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
  return { keySid: key.sid, keySecret: key.secret, appSid };
}

/** A one-hour token letting this team member call from, and take calls to, their HQ number in the browser. */
export async function voiceTokenFor(userId: string): Promise<string> {
  setup ??= voiceSetup().catch((e) => { setup = null; throw e; });
  const s = await setup;
  return voiceAccessToken({ accountSid: twilioAccountSid(), keySid: s.keySid, keySecret: s.keySecret, appSid: s.appSid, identity: voiceIdentity(userId) });
}
