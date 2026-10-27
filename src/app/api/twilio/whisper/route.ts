import { forbidden, twilioForm, xml } from "@/server/twilioWebhook";
import { RECORD_SAY } from "@/lib/texting";

export const dynamic = "force-dynamic";

/** Twilio: what someone called from HQ hears as they pick up, when calls are recorded. */
export async function POST(req: Request) {
  if (!(await twilioForm(req, "/api/twilio/whisper"))) return forbidden();
  return xml(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${RECORD_SAY}</Say></Response>`);
}
