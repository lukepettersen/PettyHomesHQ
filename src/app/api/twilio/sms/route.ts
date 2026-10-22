import { forbidden, twilioForm, xml } from "@/server/twilioWebhook";
import { recordIncoming } from "@/server/texting";
import { recordPlainGroup } from "@/server/groupText";
import { EMPTY_TWIML } from "@/lib/texting";
import { noteInbound } from "@/server/textDebug";

export const dynamic = "force-dynamic";

/** Twilio: a text came in to a team member's number (SPEC.md §11). */
export async function POST(req: Request) {
  const f = await twilioForm(req, "/api/twilio/sms");
  if (!f) return forbidden();
  await noteInbound({ via: "plain", from: f.From, to: f.To, media: Number(f.NumMedia ?? 0), fields: Object.keys(f).filter((k) => !/^(Body|MediaUrl\d+)$/.test(k)) });
  // A group text lists its other people (OtherRecipients0…); with group texting on it goes on its group thread.
  if (await recordPlainGroup(f)) return xml(EMPTY_TWIML);
  if (f.MessageSid && f.From && f.To) await recordIncoming({ from: f.From, to: f.To, body: f.Body ?? "", sid: f.MessageSid });
  return xml(EMPTY_TWIML);
}
