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
  // Each job runs on its own, so one that fails or is slow can't hold up the others (owner report 2026-11-02:
  // a same-day call's email waited). Sends go first; Gmail is read last (at most every 3 minutes), so ShowingTime
  // emails are handled even when nobody has HQ open (owner request 2026-11-01).
  const run = async (name: string, job: () => Promise<number>) => {
    try { return await job(); } catch (e) { console.error(`Minute timer: ${name} failed:`, e instanceof Error ? e.message : "unknown error"); return 0; }
  };
  const sent = await run("scheduled texts", sendDueTexts), auto = await run("automatic steps", () => sendDueAutoTasks());
  const emails = await run("scheduled emails", sendDueEmails), asks = await run("check-in texts", sendDueAsks);
  const gmail = await run("Gmail", syncGmail);
  return Response.json({ sent, auto, emails, asks, gmail });
}
