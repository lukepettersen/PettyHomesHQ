"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { guarded, UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { mergeFor } from "@/server/merge";
import { sendGmail } from "@/server/google";
import { fill } from "@/lib/merge";
import { completeTask } from "../tasks/actions";

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
});

/**
 * Sends an email from the connected Gmail account (SPEC.md §12). Only to the person's own email addresses,
 * so HQ can't be used to email anyone else. It goes on their timeline; a task it came from is checked off.
 */
export async function sendEmail(input: z.input<typeof sendSchema>) {
  return guarded(null, async (user) => {
    const v = sendSchema.parse(input);
    const p = await db.person.findFirst({ where: { id: v.personId, deletedAt: null }, include: { emails: true } });
    if (!p) throw new UserError("That person was deleted.");
    const theirs = new Set(p.emails.map((e) => e.address.toLowerCase()));
    const to = [...new Set(v.to.map((x) => x.toLowerCase()))];
    if (to.some((x) => !theirs.has(x))) throw new UserError(`HQ only emails addresses saved on ${p.name}. Add the address to their contact first.`);
    const r = await sendGmail({ to, subject: v.subject, body: v.body });
    if (!r.ok) throw new UserError(r.error);
    await db.$transaction([
      db.timelineEntry.create({ data: { personId: p.id, kind: "email", body: `To ${to.join(", ")} · ${v.subject}\n\n${v.body}`, authorId: user.id } }),
      db.person.update({ where: { id: p.id }, data: { lastContactAt: new Date() } }),
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
