"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { guarded, UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { mergeFor } from "@/server/merge";
import { sendGmail } from "@/server/google";
import { fill } from "@/lib/merge";
import { toPlain } from "@/lib/email";
import { completeTask } from "../tasks/actions";
import { attachmentList, loadAttachments } from "@/server/attachments";

const id = z.string().trim().min(1).max(40);

/** Timeline → Email: a template filled in for this person (subject, message, empty fields). */
export async function fillEmailTemplate(input: { personId: string; templateId: string }) {
  return guarded(null, async (user) => {
    const v = z.object({ personId: id, templateId: id }).parse(input);
    const t = await db.messageTemplate.findFirst({ where: { id: v.templateId, kind: "email" } });
    if (!t) throw new UserError("That template was deleted.");
    const { values, label } = await mergeFor(user, v.personId);
    const subject = fill(t.subject, values), body = fill(t.body, values);
    return { subject: subject.text, body: body.text, missing: [...new Set([...subject.missing, ...body.missing])].map(label) };
  });
}

const sendSchema = z.object({
  personId: id, taskId: z.string().trim().max(200).nullable().optional(),
  to: z.array(z.string().trim().email("That isn't an email address.").max(200)).min(1, "Pick who to send it to.").max(10),
  subject: z.string().trim().min(1, "Add a subject.").max(300), body: z.string().trim().min(1, "Write a message.").max(20000),
  signature: z.boolean().optional(),
  attachments: attachmentList,
});

/**
 * Sends an email from the connected Gmail account (SPEC.md §12) to the person's addresses plus anyone added
 * (another contact or a typed address; owner request 2026-10-20). It goes on their timeline, and on the
 * timeline of any other contact it went to; a task it came from is checked off.
 */
export async function sendEmail(input: z.input<typeof sendSchema>) {
  return guarded(null, async (user) => {
    const v = sendSchema.parse(input);
    const p = await db.person.findFirst({ where: { id: v.personId, deletedAt: null }, include: { emails: true } });
    if (!p) throw new UserError("That person was deleted.");
    const to = [...new Set(v.to.map((x) => x.toLowerCase()))];
    const files = await loadAttachments(v.attachments);
    const r = await sendGmail({ to, subject: v.subject, body: v.body, signature: v.signature, attachments: files, asUserId: user.id });
    if (!r.ok) throw new UserError(r.error);
    // Other contacts it went to get it on their timeline too.
    const others = await db.person.findMany({ where: { id: { not: p.id }, deletedAt: null, emails: { some: { normalized: { in: to } } } }, select: { id: true } });
    const entry = (personId: string) => db.timelineEntry.create({ data: { personId, kind: "email", gmailId: r.id ? `${r.id}:${personId}` : null, body: `To ${to.join(", ")} · ${v.subject}\n\n${toPlain(v.body)}${files.length ? `\n\n📎 ${files.map((f) => f.name).join(", ")}` : ""}`, authorId: user.id } });
    await db.$transaction([
      entry(p.id), ...others.map((o) => entry(o.id)),
      db.person.updateMany({ where: { id: { in: [p.id, ...others.map((o) => o.id)] } }, data: { lastContactAt: new Date() } }),
    ]);
    await logActivity(user.id, "create", "email", p.id, `Emailed ${p.name}: "${v.subject}"`);
    if (v.taskId) {
      const t = await db.task.findFirst({ where: { id: v.taskId, personId: p.id, deletedAt: null, completedAt: null } });
      if (t) await completeTask(t.id);
    }
    revalidatePath(`/people/${p.id}`);
    revalidatePath("/tasks");
  });
}
