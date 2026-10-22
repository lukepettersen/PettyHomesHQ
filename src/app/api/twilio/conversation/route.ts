import { forbidden, twilioForm } from "@/server/twilioWebhook";
import { handleConversationMessage } from "@/server/groupText";

export const dynamic = "force-dynamic";

/** Twilio Conversations: a new message in a group text or one-to-one chat on a team number (SPEC.md §11). */
export async function POST(req: Request) {
  const f = await twilioForm(req, "/api/twilio/conversation");
  if (!f) return forbidden();
  try {
    await handleConversationMessage(f);
  } catch (e) {
    console.error("Conversation webhook failed", (e as Error).message);
    return new Response("Try again", { status: 500 }); // Twilio retries
  }
  return new Response(null, { status: 200 });
}
