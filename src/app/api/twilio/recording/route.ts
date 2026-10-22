import { forbidden, twilioForm } from "@/server/twilioWebhook";
import { recordRecording } from "@/server/texting";

export const dynamic = "force-dynamic";

/** Twilio: an answered call's recording is ready. HQ keeps only its id; the audio stays in Twilio. */
export async function POST(req: Request) {
  const f = await twilioForm(req, "/api/twilio/recording");
  if (!f) return forbidden();
  if (f.RecordingStatus === "completed" && f.CallSid && f.RecordingSid) {
    await recordRecording({ callSid: f.CallSid, recordingSid: f.RecordingSid, seconds: Number(f.RecordingDuration ?? 0) });
  }
  return new Response(null, { status: 204 });
}
