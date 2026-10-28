import { timingSafeEqual } from "node:crypto";
import { cronKey, sendDueTexts } from "@/server/scheduledTexts";

export const dynamic = "force-dynamic";

/** Sends scheduled texts that are due. Called every minute by the app itself with its own key; no one else can. */
export async function POST(req: Request) {
  const got = Buffer.from(req.headers.get("x-cron-key") ?? ""), want = Buffer.from(cronKey());
  if (got.length !== want.length || !timingSafeEqual(got, want)) return Response.json({ error: "Not allowed" }, { status: 403 });
  return Response.json({ sent: await sendDueTexts() });
}
