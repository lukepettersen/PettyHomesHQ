import { forbidden, twilioForm } from "@/server/twilioWebhook";
import { updateStatus } from "@/server/texting";

export const dynamic = "force-dynamic";

/** Twilio: delivery news for a text HQ sent (sent, delivered, failed…). */
export async function POST(req: Request) {
  const f = await twilioForm(req, "/api/twilio/status");
  if (!f) return forbidden();
  if (f.MessageSid && f.MessageStatus) await updateStatus(f.MessageSid, f.MessageStatus, f.ErrorCode || null);
  return new Response(null, { status: 204 });
}
