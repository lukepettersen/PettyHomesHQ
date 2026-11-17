import { db } from "@/server/db";
import { forbidden, twilioForm, xml } from "@/server/twilioWebhook";
import { recordCalls } from "@/server/integrations";
import { publicBase } from "@/server/twilio";
import { outboundTwiml, toE164 } from "@/lib/texting";
import { userFromIdentity } from "@/lib/voiceToken";
import { noteInbound } from "@/server/textDebug";

export const dynamic = "force-dynamic";

/**
 * Twilio (HQ's calling TwiML App): a team member pressed Call in HQ. Dial the number showing their HQ number,
 * recorded like other calls when recording is on (the person called hears "This call may be recorded").
 */
export async function POST(req: Request) {
  const f = await twilioForm(req, "/api/twilio/outbound");
  if (!f) return forbidden();
  const id = userFromIdentity(f.From);
  const user = id ? await db.user.findFirst({ where: { id, status: { not: "DISABLED" }, textNumber: { not: null } }, select: { textNumber: true, name: true } }) : null;
  const base = publicBase();
  if (!user?.textNumber) return xml(outboundTwiml({ to: null, callerId: "", action: "" }));
  await noteInbound({ via: "call", from: f.To, to: user.textNumber, call: `${user.name.split(" ")[0]} calling out from HQ` });
  const rec = await recordCalls();
  return xml(outboundTwiml({
    to: toE164(f.To ?? ""), callerId: user.textNumber, action: `${base}/api/twilio/outbound/done`,
    record: rec ? `${base}/api/twilio/recording` : undefined, whisper: rec ? `${base}/api/twilio/whisper` : undefined,
  }));
}
