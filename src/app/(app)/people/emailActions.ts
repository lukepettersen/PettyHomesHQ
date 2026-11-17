"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { guarded, UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { mergeFor } from "@/server/merge";
import { fill } from "@/lib/merge";
import { completeTask } from "../tasks/actions";
import { attachmentList } from "@/server/attachments";
import { deliverEmail } from "@/server/emailSend";
import { hasPermission } from "@/server/permissions";
import { centralToUtc, scheduleLabel, scheduleProblem } from "@/lib/scheduledText";

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
    const p = await deliverEmail(user, v);
    if (v.taskId) {
      const t = await db.task.findFirst({ where: { id: v.taskId, personId: p.id, deletedAt: null, completedAt: null } });
      if (t) await completeTask(t.id);
    }
    revalidatePath(`/people/${p.id}`);
    revalidatePath("/tasks");
  });
}

const scheduleSchema = sendSchema.extend({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/) });

/** Schedule an email (owner request 2026-10-29): it goes out from your Gmail within a minute of the time you pick. */
export async function scheduleEmail(input: z.input<typeof scheduleSchema>) {
  return guarded(null, async (user) => {
    const v = scheduleSchema.parse(input);
    const problem = scheduleProblem(v.date, v.time);
    if (problem) throw new UserError(problem);
    const p = await db.person.findFirst({ where: { id: v.personId, deletedAt: null }, select: { id: true, name: true } });
    if (!p) throw new UserError("That person was deleted.");
    const sendAt = centralToUtc(v.date, v.time);
    await db.scheduledEmail.create({ data: {
      personId: p.id, to: [...new Set(v.to.map((x) => x.toLowerCase()))], subject: v.subject, body: v.body, signature: v.signature ?? true,
      attachments: v.attachments ?? [], sendAt, taskId: v.taskId?.startsWith("date:") ? null : v.taskId ?? null, createdById: user.id,
    } });
    await logActivity(user.id, "create", "scheduledEmail", p.id, `Scheduled an email to ${p.name} for ${scheduleLabel(sendAt)}: "${v.subject}"`);
    revalidatePath(`/people/${p.id}`);
    return { when: scheduleLabel(sendAt) };
  });
}

/** Cancel a scheduled email that hasn't gone out: the person who scheduled it, or anyone allowed to delete records. */
export async function cancelScheduledEmail(scheduledId: string) {
  return guarded(null, async (user) => {
    const s = await db.scheduledEmail.findUnique({ where: { id: id.parse(scheduledId) } });
    if (!s || s.status !== "pending") throw new UserError("That email already went out or was canceled.");
    if (s.createdById !== user.id && !hasPermission(user.permissions as never, "deleteRecords")) throw new UserError("Only the person who scheduled it can cancel it.");
    const r = await db.scheduledEmail.updateMany({ where: { id: s.id, status: "pending" }, data: { status: "canceled" } });
    if (!r.count) throw new UserError("That email is going out right now.");
    await logActivity(user.id, "delete", "scheduledEmail", s.personId, `Canceled the email scheduled for ${scheduleLabel(s.sendAt)}`);
    revalidatePath(`/people/${s.personId}`);
  });
}
