import { db } from "@/server/db";
import { publicBase } from "@/server/twilio";
import { loadEmailKinds } from "@/server/emailKinds";
import { EMAIL_UNSUB_TAG, kindTag, validUnsub } from "@/lib/bulkEmail";

export const dynamic = "force-dynamic";

/**
 * The unsubscribe link in a mass email (no sign-in): confirmed with a button on /unsubscribe, so link scanners that
 * open every link don't unsubscribe people. "All emails" tags them "Email Unsubscribed"; each kind picked tags them
 * "Unsubscribed: <kind>" (owner request 2026-11-02). Ticking nothing changes nothing.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const p = String(form?.get("p") ?? "").slice(0, 40), t = String(form?.get("t") ?? "").slice(0, 60);
  const back = (q: string) => Response.redirect(`${publicBase() || new URL(req.url).origin}/unsubscribe?${q}`, 303);
  if (!p || !validUnsub(p, t, process.env.NEXTAUTH_SECRET ?? "")) return back("bad=1");
  const all = form?.get("all") === "1";
  const kinds = await loadEmailKinds();
  const picked = (form?.getAll("kind") ?? []).map(String).filter((k) => kinds.includes(k));
  if (!all && !picked.length) return back(`p=${encodeURIComponent(p)}&t=${encodeURIComponent(t)}`);
  const person = await db.person.findFirst({ where: { id: p }, select: { id: true } });
  if (person) {
    const names = all ? [EMAIL_UNSUB_TAG] : picked.map(kindTag);
    const added: string[] = [];
    for (const name of names) {
      const tag = await db.tag.upsert({ where: { name }, create: { name }, update: {} });
      const had = await db.personTag.findUnique({ where: { personId_tagId: { personId: p, tagId: tag.id } } });
      if (!had) { await db.personTag.create({ data: { personId: p, tagId: tag.id } }); added.push(name); }
    }
    if (added.length) await db.timelineEntry.create({ data: { personId: p, kind: "system",
      body: all ? "Unsubscribed from all mass emails (link at the bottom of an email). Tagged Email Unsubscribed."
        : `Unsubscribed from ${picked.join(", ")} emails (link at the bottom of an email). Tagged ${added.join(", ")}.` } });
  }
  return back(all ? "done=all" : "done=1");
}
