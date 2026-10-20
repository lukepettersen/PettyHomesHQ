"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { guarded, UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { mergeFor } from "@/server/merge";
import { emailConnection, sendGmail } from "@/server/google";
import { publicBase } from "@/server/twilio";
import { fill } from "@/lib/merge";
import { toPlain } from "@/lib/email";
import { BATCH, BULK_MAX, bulkFooter, pickRecipients, unsubToken } from "@/lib/bulkEmail";

// Mass email from People (SPEC.md §6.2): one email per person from the connected Gmail, merge fields filled
// for each, an unsubscribe link and mailing address at the bottom. The browser sends it in small groups.

const ids = z.array(z.string().trim().min(1).max(40)).min(1, "Select people first.").max(BULK_MAX, `Up to ${BULK_MAX.toLocaleString()} people at a time.`);
const ADDRESS_KEY = "email.mailingAddress";

async function loadPeople(personIds: string[]) {
  const people = await db.person.findMany({ where: { id: { in: personIds }, deletedAt: null }, select: { id: true, name: true, emails: { orderBy: { position: "asc" }, select: { address: true } }, tags: { select: { tag: { select: { name: true } } } } } });
  return pickRecipients(people.map((p) => ({ id: p.id, name: p.name, emails: p.emails.map((e) => e.address), tags: p.tags.map((t) => t.tag.name) })));
}

/** Who will get it, templates, the saved mailing address and whether Gmail is connected. */
export async function prepareBulkEmail(input: { ids: string[] }) {
  return guarded(null, async () => {
    const v = z.object({ ids }).parse(input);
    const [{ send, skipped }, templates, address, gmail] = await Promise.all([
      loadPeople(v.ids),
      db.messageTemplate.findMany({ where: { kind: "email" }, orderBy: [{ folder: "asc" }, { name: "asc" }], select: { id: true, name: true, folder: true, subject: true, body: true } }),
      db.appSetting.findUnique({ where: { key: ADDRESS_KEY } }), emailConnection(),
    ]);
    return {
      recipients: send.map((r) => ({ personId: r.personId, name: r.name })), skipped, sendsFrom: gmail?.email ?? null,
      address: typeof address?.value === "string" ? address.value : "",
      templates: templates.map((t) => ({ id: t.id, name: t.folder ? `${t.folder} · ${t.name}` : t.name, subject: t.subject, body: t.body })),
    };
  });
}

/** The email as one person will get it (merge fields filled). */
export async function previewBulkEmail(input: { personId: string; subject: string; body: string }) {
  return guarded(null, async (user) => {
    const v = z.object({ personId: z.string().min(1).max(40), subject: z.string().max(300), body: z.string().max(20000) }).parse(input);
    const { values, label } = await mergeFor(user, v.personId);
    const s = fill(v.subject, values), b = fill(v.body, values);
    return { subject: s.text, body: b.text, missing: [...new Set([...s.missing, ...b.missing])].map(label) };
  });
}

const sendSchema = z.object({
  personIds: z.array(z.string().trim().min(1).max(40)).min(1).max(BATCH),
  subject: z.string().trim().min(1, "Add a subject.").max(300), body: z.string().trim().min(1, "Write a message.").max(20000),
  address: z.string().trim().min(8, "Add your business mailing address for the footer (the law requires one on marketing email).").max(200),
  signature: z.boolean().optional(),
});

/** Sends to a few people. Anyone who opted out or has no email since the preview is skipped. */
export async function sendBulkEmailBatch(input: z.input<typeof sendSchema>) {
  return guarded(null, async (user) => {
    const v = sendSchema.parse(input);
    if (!(await emailConnection())) throw new UserError("Gmail isn't connected. An Admin can reconnect Google in Admin → Integrations.");
    const secret = process.env.NEXTAUTH_SECRET ?? "";
    if (!secret || !publicBase()) throw new UserError("HQ's address isn't set up for unsubscribe links (NEXTAUTH_URL / NEXTAUTH_SECRET).");
    await db.appSetting.upsert({ where: { key: ADDRESS_KEY }, update: { value: v.address }, create: { key: ADDRESS_KEY, value: v.address } });
    const { send } = await loadPeople(v.personIds);
    const sent: string[] = [], failed: { name: string; error: string }[] = [];
    for (const r of send) {
      const { values } = await mergeFor(user, r.personId);
      const subject = fill(v.subject, values).text;
      const url = `${publicBase()}/unsubscribe?p=${r.personId}&t=${unsubToken(r.personId, secret)}`;
      const body = fill(v.body, values).text + bulkFooter(v.address, url);
      const res = await sendGmail({ to: [r.email], subject, body, signature: v.signature });
      if (!res.ok) {
        failed.push({ name: r.name, error: res.error });
        if (/isn't connected|didn't let HQ in|limit|quota/i.test(res.error)) break; // Gmail itself stopped: no point trying the rest
        continue;
      }
      sent.push(r.name);
      await db.$transaction([
        db.timelineEntry.create({ data: { personId: r.personId, kind: "email", gmailId: res.id ? `${res.id}:${r.personId}` : null, body: `To ${r.email} · ${subject}\n\n${toPlain(fill(v.body, values).text)}`, authorId: user.id } }),
        db.person.update({ where: { id: r.personId }, data: { lastContactAt: new Date() } }),
      ]);
    }
    if (sent.length) await logActivity(user.id, "create", "email", null, `Mass email "${v.subject}" sent to ${sent.length} ${sent.length === 1 ? "person" : "people"}`);
    revalidatePath("/people");
    return { sent: sent.length, failed };
  });
}
