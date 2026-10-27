import { forbidden, twilioForm, xml } from "@/server/twilioWebhook";
import { recordOutboundCall } from "@/server/texting";
import { EMPTY_TWIML } from "@/lib/texting";
import { userFromIdentity } from "@/lib/voiceToken";

export const dynamic = "force-dynamic";

/** Twilio: how a call placed from HQ went. It goes on the contact's timeline (answered with its length, or no answer). */
export async function POST(req: Request) {
  const f = await twilioForm(req, "/api/twilio/outbound/done");
  if (!f) return forbidden();
  const id = userFromIdentity(f.From);
  if (id && f.CallSid && f.To) {
    await recordOutboundCall({ userId: id, to: f.To, sid: f.CallSid, seconds: Number(f.DialCallDuration ?? 0), answered: f.DialCallStatus === "completed", recordingSid: f.RecordingSid || null });
  }
  return xml(EMPTY_TWIML);
}
