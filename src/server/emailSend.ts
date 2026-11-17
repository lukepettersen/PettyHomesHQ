import "server-only";
import { db } from "@/server/db";
import { UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { sendGmail } from "@/server/google";
import { toPlain } from "@/lib/email";
import { loadAttachments, type attachmentList } from "@/server/attachments";
import type { z } from "zod";

export type OutgoingEmail = { personId: string; to: string[]; subject: string; body: string; signature?: boolean; attachments?: z.infer<typeof attachmentList> };

/**
 * Sends one email from the sender's Gmail (SPEC.md §12) and records it: on the person's timeline and that of any other
 * contact it went to. Used by Send email and by scheduled emails.
 */
export async function deliverEmail(sender: { id: string }, v: OutgoingEmail) {
  const p = await db.person.findFirst({ where: { id: v.personId, deletedAt: null }, select: { id: true, name: true } });
  if (!p) throw new UserError("That person was deleted.");
  const to = [...new Set(v.to.map((x) => x.toLowerCase()))];
  const files = await loadAttachments(v.attachments);
  const r = await sendGmail({ to, subject: v.subject, body: v.body, signature: v.signature, attachments: files, asUserId: sender.id });
  if (!r.ok) throw new UserError(r.error);
  // Other contacts it went to get it on their timeline too.
  const others = await db.person.findMany({ where: { id: { not: p.id }, deletedAt: null, emails: { some: { normalized: { in: to } } } }, select: { id: true } });
  const entry = (personId: string) => db.timelineEntry.create({ data: { personId, kind: "email", gmailId: r.id ? `${r.id}:${personId}` : null, body: `To ${to.join(", ")} · ${v.subject}\n\n${toPlain(v.body)}${files.length ? `\n\n📎 ${files.map((f) => f.name).join(", ")}` : ""}`, authorId: sender.id } });
  await db.$transaction([
    entry(p.id), ...others.map((o) => entry(o.id)),
    db.person.updateMany({ where: { id: { in: [p.id, ...others.map((o) => o.id)] } }, data: { lastContactAt: new Date() } }),
  ]);
  await logActivity(sender.id, "create", "email", p.id, `Emailed ${p.name}: "${v.subject}"`);
  return p;
}
