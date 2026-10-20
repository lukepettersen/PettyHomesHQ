import { db } from "@/server/db";
import { forbidden, twilioForm, xml } from "@/server/twilioWebhook";
import { recordMissedCall } from "@/server/texting";
import { publicBase } from "@/server/twilio";
import { EMPTY_TWIML, missedDial, toE164, voiceTwiml } from "@/lib/texting";

export const dynamic = "force-dynamic";

/**
 * Twilio: how a forwarded call went. If the cell couldn't be rung showing the caller's number, try once more
 * showing the business number. Not picked up → the caller hears the text-us message; HQ logs a missed call.
 */
export async function POST(req: Request) {
  const f = await twilioForm(req, "/api/twilio/voice/done");
  if (!f) return forbidden();
  if (!missedDial(f.DialCallStatus)) return xml(EMPTY_TWIML);
  const retried = new URL(req.url).searchParams.get("retry") === "1";
  if (["failed", "busy"].includes(f.DialCallStatus ?? "") && !retried && f.To) {
    console.error("Call forward failed; retrying with the business number as caller ID");
    const owner = await db.user.findFirst({ where: { textNumber: f.To }, select: { forwardTo: true } });
    const cell = owner?.forwardTo ? toE164(owner.forwardTo) : null;
    if (cell) return xml(voiceTwiml({ forwardTo: cell, action: `${publicBase()}/api/twilio/voice/done?retry=1` }));
  }
  if (f.CallSid && f.From && f.To) await recordMissedCall({ from: f.From, to: f.To, sid: f.CallSid });
  return xml(voiceTwiml({}));
}
