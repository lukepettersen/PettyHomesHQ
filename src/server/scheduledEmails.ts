import "server-only";
import { db } from "@/server/db";
import { UserError } from "@/server/safe";
import { deliverEmail } from "@/server/emailSend";
import { scheduleLabel } from "@/lib/scheduledText";
import type { z } from "zod";
import type { attachmentList } from "@/server/attachments";

// Scheduled emails (owner request 2026-10-29): sent from the scheduler's Gmail by the same minute timer as scheduled
// texts (/api/cron/scheduled-texts).

export async function sendDueEmails(now = new Date()): Promise<number> {
  const due = await db.scheduledEmail.findMany({ where: { status: "pending", sendAt: { lte: now } }, orderBy: { sendAt: "asc" }, take: 20 });
  let sent = 0;
  for (const s of due) {
    // Claim it first, so two servers (or two ticks) never send the same email twice.
    const claim = await db.scheduledEmail.updateMany({ where: { id: s.id, status: "pending" }, data: { status: "sending" } });
    if (!claim.count) continue;
    const user = await db.user.findUnique({ where: { id: s.createdById }, select: { id: true, status: true } });
    try {
      if (!user || user.status === "DISABLED") throw new UserError("The person who scheduled it no longer has access.");
      await deliverEmail(user, { personId: s.personId, to: s.to, subject: s.subject, body: s.body, signature: s.signature, attachments: (Array.isArray(s.attachments) ? s.attachments : []) as z.infer<typeof attachmentList> });
      await db.scheduledEmail.update({ where: { id: s.id }, data: { status: "sent", sentAt: new Date() } });
      if (s.taskId) await db.task.updateMany({ where: { id: s.taskId, completedAt: null }, data: { completedAt: new Date(), completedById: s.createdById } });
      sent++;
    } catch (e) {
      const why = e instanceof UserError ? e.message : "Something went wrong sending it. Send it by hand from their page.";
      if (!(e instanceof UserError)) console.error("Scheduled email failed:", s.id, e instanceof Error ? e.name : "error");
      await db.scheduledEmail.update({ where: { id: s.id }, data: { status: "failed", error: why.slice(0, 300) } });
      if (user) await db.notification.create({ data: { toId: user.id, personId: s.personId, alert: true, text: `Scheduled email "${s.subject}" (${scheduleLabel(s.sendAt)}) wasn't sent: ${why}` } });
    }
  }
  return sent;
}

/** A contact's scheduled emails not yet sent, and ones that failed in the last week; ids are "email:<id>". */
export async function loadScheduledEmails(personId: string, userId: string, canCancelAny: boolean) {
  const rows = await db.scheduledEmail.findMany({ where: { personId, OR: [{ status: { in: ["pending", "sending"] } }, { status: "failed", sendAt: { gte: new Date(Date.now() - 7 * 86400000) } }] }, orderBy: { sendAt: "asc" } });
  if (!rows.length) return [];
  const by = new Map((await db.user.findMany({ where: { id: { in: rows.map((x) => x.createdById) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name.split(" ")[0]]));
  const people = await db.email.findMany({ where: { normalized: { in: [...new Set(rows.flatMap((x) => x.to))] }, person: { deletedAt: null } }, select: { normalized: true, person: { select: { name: true } } } });
  const nameOf = (a: string) => people.find((x) => x.normalized === a)?.person.name ?? a;
  return rows.map((x) => ({
    id: `email:${x.id}`, at: x.sendAt.getTime(), when: scheduleLabel(x.sendAt), to: [...new Set(x.to.map(nameOf))].join(", "), body: `Email: ${x.subject}\n\n${x.body}`,
    by: by.get(x.createdById) ?? "", mine: x.createdById === userId || canCancelAny, status: x.status === "sending" ? "pending" : x.status, error: x.error, personId: x.personId, auto: false, email: true,
  }));
}
