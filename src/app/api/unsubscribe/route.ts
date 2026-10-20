import { db } from "@/server/db";
import { publicBase } from "@/server/twilio";
import { EMAIL_UNSUB_TAG, validUnsub } from "@/lib/bulkEmail";

export const dynamic = "force-dynamic";

/**
 * The unsubscribe link in a mass email (no sign-in): confirmed with a button on /unsubscribe, so link
 * scanners that open every link don't unsubscribe people. Tags them "Email Unsubscribed".
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const p = String(form?.get("p") ?? "").slice(0, 40), t = String(form?.get("t") ?? "").slice(0, 60);
  const back = (q: string) => Response.redirect(`${publicBase() || new URL(req.url).origin}/unsubscribe?${q}`, 303);
  if (!p || !validUnsub(p, t, process.env.NEXTAUTH_SECRET ?? "")) return back("bad=1");
  const person = await db.person.findFirst({ where: { id: p }, select: { id: true } });
  if (person) {
    const tag = await db.tag.upsert({ where: { name: EMAIL_UNSUB_TAG }, create: { name: EMAIL_UNSUB_TAG }, update: {} });
    const had = await db.personTag.findUnique({ where: { personId_tagId: { personId: p, tagId: tag.id } } });
    if (!had) await db.$transaction([
      db.personTag.create({ data: { personId: p, tagId: tag.id } }),
      db.timelineEntry.create({ data: { personId: p, kind: "system", body: "Unsubscribed from mass emails (link at the bottom of an email). Tagged Email Unsubscribed." } }),
    ]);
  }
  return back("done=1");
}
