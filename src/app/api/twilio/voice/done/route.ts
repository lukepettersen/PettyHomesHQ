import { forbidden, twilioForm, xml } from "@/server/twilioWebhook";
import { recordMissedCall } from "@/server/texting";
import { EMPTY_TWIML, missedDial, voiceTwiml } from "@/lib/texting";

export const dynamic = "force-dynamic";

/** Twilio: how a forwarded call went. Not picked up → the caller hears the text-us message; HQ logs a missed call. */
export async function POST(req: Request) {
  const f = await twilioForm(req, "/api/twilio/voice/done");
  if (!f) return forbidden();
  if (!missedDial(f.DialCallStatus)) return xml(EMPTY_TWIML);
  if (f.CallSid && f.From && f.To) await recordMissedCall({ from: f.From, to: f.To, sid: f.CallSid });
  return xml(voiceTwiml({}));
}
