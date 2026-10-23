import { db } from "@/server/db";
import { forbidden, twilioForm, xml } from "@/server/twilioWebhook";
import { recordMissedCall } from "@/server/texting";
import { recordCalls } from "@/server/integrations";
import { publicBase } from "@/server/twilio";
import { toE164, voiceTwiml } from "@/lib/texting";
import { noteInbound } from "@/server/textDebug";

export const dynamic = "force-dynamic";

/**
 * Twilio: someone is calling a team member's number. Ring their cell if they have one set (recorded from the
 * answer, after "This call may be recorded", unless recording is off), else a missed call.
 */
export async function POST(req: Request) {
  const f = await twilioForm(req, "/api/twilio/voice");
  if (!f) return forbidden();
  const owner = f.To ? await db.user.findFirst({ where: { textNumber: f.To }, select: { forwardTo: true } }) : null;
  const cell = owner?.forwardTo ? toE164(owner.forwardTo) : null;
  await noteInbound({ via: "call", from: f.From, to: f.To, call: !owner ? "no team member has this number" : cell ? `ringing cell …${cell.slice(-4)}` : "no cell set: missed-call message" });
  if (cell) {
    const rec = await recordCalls();
    return xml(voiceTwiml({ forwardTo: cell, callerId: f.From, action: `${publicBase()}/api/twilio/voice/done`, record: rec ? `${publicBase()}/api/twilio/recording` : undefined, notice: rec }));
  }
  if (f.CallSid && f.From && f.To) await recordMissedCall({ from: f.From, to: f.To, sid: f.CallSid });
  return xml(voiceTwiml({}));
}
