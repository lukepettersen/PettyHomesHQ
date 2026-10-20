import { forbidden, twilioForm, xml } from "@/server/twilioWebhook";
import { recordIncoming } from "@/server/texting";
import { EMPTY_TWIML } from "@/lib/texting";

export const dynamic = "force-dynamic";

/** Twilio: a text came in to a team member's number (SPEC.md §11). */
export async function POST(req: Request) {
  const f = await twilioForm(req, "/api/twilio/sms");
  if (!f) return forbidden();
  if (f.MessageSid && f.From && f.To) await recordIncoming({ from: f.From, to: f.To, body: f.Body ?? "", sid: f.MessageSid });
  return xml(EMPTY_TWIML);
}
