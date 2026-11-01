import { timingSafeEqual } from "node:crypto";
import { cronKey, sendDueTexts } from "@/server/scheduledTexts";
import { sendDueAutoTasks } from "@/server/autoSend";
import { sendDueEmails } from "@/server/scheduledEmails";
import { sendDueAsks } from "@/server/askByText";
import { syncGmail } from "@/server/google";

export const dynamic = "force-dynamic";

/** Sends scheduled texts and automatic checklist steps that are due. Called every minute by the app itself with its own key; no one else can. */
export async function POST(req: Request) {
  const got = Buffer.from(req.headers.get("x-cron-key") ?? ""), want = Buffer.from(cronKey());
  if (got.length !== want.length || !timingSafeEqual(got, want)) return Response.json({ error: "Not allowed" }, { status: 403 });
  // Gmail is read here too (at most every 3 minutes), so ShowingTime emails are handled even when nobody has HQ open (owner request 2026-11-01).
  const gmail = await syncGmail().catch(() => 0);
  return Response.json({ sent: await sendDueTexts(), auto: await sendDueAutoTasks(), emails: await sendDueEmails(), asks: await sendDueAsks(), gmail });
}
