import "server-only";
import { db } from "@/server/db";
import { UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { sendTextAs } from "@/server/texting";
import { groupReady, textNumbersAsGroup } from "@/server/groupText";
import { sendGmail } from "@/server/google";
import { mergeFor } from "@/server/merge";
import { loadForm } from "@/server/pa";
import { fill } from "@/lib/merge";
import { toPlain } from "@/lib/email";
import { isoFromDate, normalizePhone } from "@/lib/normalize";
import { centralToUtc } from "@/lib/scheduledText";
import { partnerFromAnswers } from "@/lib/partners";
import { resolveRecipients, type DealPersonContact } from "@/lib/autoSend";
import type { AutoSend, Phase } from "@/lib/templates";
import type { Side } from "@/lib/pa";
import type { SessionUser } from "@/server/auth";

// Checklist steps that send a text or email by themselves (owner request 2026-10-29). Called every minute with the
// scheduled texts (/api/cron/scheduled-texts). The task's due date and time are the send time, so a step re-dated
// with the contract simply goes out at its new time.

const asAuto = (v: unknown): AutoSend | null => (v && typeof v === "object" && Array.isArray((v as AutoSend).to) ? (v as AutoSend) : null);

/** When an automatic step goes out: its due date at its due time (Central), 9:00am if it somehow has none. */
export const autoSendAt = (t: { dueDate: Date | null; dueTime: string | null; autoSend: unknown }) =>
  t.dueDate ? centralToUtc(isoFromDate(t.dueDate), t.dueTime ?? asAuto(t.autoSend)?.time ?? "09:00") : null;

export async function sendDueAutoTasks(now = new Date()): Promise<number> {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const due = (await db.task.findMany({
    where: { autoState: "pending", completedAt: null, deletedAt: null, dueDate: { lte: today }, kind: { in: ["text", "email"] } },
    orderBy: { dueDate: "asc" }, take: 50,
  })).filter((t) => (autoSendAt(t)?.getTime() ?? Infinity) <= now.getTime()).slice(0, 20);
  let sent = 0;
  for (const t of due) {
    const claim = await db.task.updateMany({ where: { id: t.id, autoState: "pending", completedAt: null }, data: { autoState: "sending" } });
    if (!claim.count) continue;
    let senderId: string | null = null;
    try {
      const auto = asAuto(t.autoSend);
      if (!auto || !t.personId) throw new UserError("This step isn't set up to send by itself any more.");
      const team = await db.user.findMany({ where: { status: { not: "DISABLED" } }, include: { role: true } });
      const sender = (auto.from ? team.find((u) => u.name.split(/\s+/)[0].toLowerCase() === auto.from.toLowerCase()) : null) ?? team.find((u) => u.id === t.assigneeId) ?? team.find((u) => u.isOwner);
      if (!sender) throw new UserError("Nobody on the team can send it.");
      senderId = sender.id;
      const su: SessionUser = { id: sender.id, name: sender.name, email: sender.email, role: sender.role.name, permissions: sender.role.permissions, isOwner: sender.isOwner };

      // The message: the step's template, filled in for this person and deal at send time.
      const tpl = t.templateId ? await db.taskTemplate.findUnique({ where: { id: t.templateId } }) : null;
      const step = (Array.isArray(tpl?.phases) ? (tpl!.phases as unknown as Phase[]) : []).flatMap((p) => p.steps).find((s) => s.id === t.stepId);
      // Same lookup as Draft text/email: the template picked, else one named like the step's old typed name.
      const msg = step?.messageId ? await db.messageTemplate.findUnique({ where: { id: step.messageId } })
        : step?.message ? await db.messageTemplate.findFirst({ where: { kind: t.kind, name: { equals: step.message, mode: "insensitive" } } }) : null;
      if (!msg) throw new UserError("No message template is picked for this step (Admin → Task templates).");
      const { values } = await mergeFor(su, t.personId, { paId: t.paId, fileId: t.fileId });
      const body = fill(msg.body, values), subject = fill(msg.subject, values);
      if (body.missing.length || (t.kind === "email" && subject.missing.length)) throw new UserError("Some details the template needs aren't filled in yet, so it wasn't sent. Send it by hand from the step.");

      // Who it goes to.
      const person = await db.person.findFirst({ where: { id: t.personId, deletedAt: null }, include: { phones: { orderBy: { position: "asc" } }, emails: { orderBy: { position: "asc" } } } });
      if (!person) throw new UserError("That person was deleted.");
      const pa = t.paId ? await db.purchaseAgreement.findUnique({ where: { id: t.paId }, include: { partners: { include: { person: { select: { name: true, emails: { take: 1, orderBy: { position: "asc" } }, phones: { take: 1, orderBy: { position: "asc" } } } } } } } })
        : t.fileId ? await db.purchaseAgreement.findFirst({ where: { fileId: t.fileId, state: "active", deletedAt: null }, include: { partners: { include: { person: { select: { name: true, emails: { take: 1, orderBy: { position: "asc" } }, phones: { take: 1, orderBy: { position: "asc" } } } } } } } }) : null;
      const deal: DealPersonContact[] = [];
      if (pa) {
        const answers = (pa.answers ?? {}) as Record<string, string>;
        for (const sec of (await loadForm(pa.side as Side)).filter((x) => x.people)) {
          const typed = partnerFromAnswers(sec, answers), picked = pa.partners.find((x) => x.sectionId === sec.id)?.person;
          deal.push({ sectionId: sec.id, role: sec.name, name: picked?.name ?? typed.name, email: picked?.emails[0]?.address ?? typed.email, phone: picked?.phones[0]?.number ?? typed.phone });
        }
      }
      const kind = t.kind === "email" ? "email" : "text";
      const r = resolveRecipients(kind, auto.to, {
        clientName: person.name, clientPhones: person.phones.map((x) => x.normalized), clientEmails: person.emails.map((x) => x.address), deal,
        team: team.map((u) => ({ first: u.name.split(/\s+/)[0], name: u.name, email: u.email, cell: u.forwardTo ? normalizePhone(u.forwardTo) : null })),
      });
      if (!(kind === "text" ? r.numbers : r.emails).length) throw new UserError(`Nobody to send it to: no ${kind === "text" ? "phone number" : "email"} on file for ${r.missing.join(", ") || "the people picked"}.`);

      if (kind === "text") {
        if (r.numbers.length > 1 && (await groupReady())) await textNumbersAsGroup(sender, { numbers: r.numbers, body: body.text });
        else for (const n of r.numbers) await sendTextAs(sender, { personId: person.phones.some((x) => x.normalized === n) ? person.id : null, to: n, body: body.text, typed: true });
      } else {
        const res = await sendGmail({ to: r.emails, subject: subject.text, body: body.text, signature: true, asUserId: sender.id });
        if (!res.ok) throw new UserError(res.error);
        await db.timelineEntry.create({ data: { personId: person.id, kind: "email", gmailId: res.id ? `${res.id}:${person.id}` : null, body: `To ${r.emails.join(", ")} · ${subject.text}\n\n${toPlain(body.text)}`, authorId: sender.id } });
        await db.person.update({ where: { id: person.id }, data: { lastContactAt: new Date() } });
      }
      await db.task.update({ where: { id: t.id }, data: { autoState: "sent", autoError: r.missing.length ? `Not sent to ${r.missing.join(", ")} (nothing on file)` : null, completedAt: new Date(), completedById: sender.id } });
      await logActivity(sender.id, "create", kind, person.id, `Sent automatically: "${t.title}" to ${r.names.join(", ")}`);
      sent++;
    } catch (e) {
      const why = e instanceof UserError ? e.message : "Something went wrong sending it. Send it by hand from the step.";
      if (!(e instanceof UserError)) console.error("Automatic step failed:", t.id, e instanceof Error ? e.name : "error");
      await db.task.update({ where: { id: t.id }, data: { autoState: "failed", autoError: why.slice(0, 300) } });
      // The sender and the person the step is assigned to hear about it; the step stays open to do by hand.
      for (const to of [...new Set([senderId, t.assigneeId].filter((x): x is string => !!x))]) {
        await db.notification.create({ data: { toId: to, personId: t.personId, alert: true, text: `Automatic ${t.kind} "${t.title}" wasn't sent: ${why}` } });
      }
    }
  }
  return sent;
}
