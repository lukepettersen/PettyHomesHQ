import "server-only";
import { db } from "@/server/db";
import { sendSms } from "@/server/twilio";
import { textingEnabled } from "@/server/integrations";
import { logActivity } from "@/server/activity";
import { advanceAfterDone } from "@/server/automation";
import { autoSendAt } from "@/server/autoSend";
import { normalizePhone } from "@/lib/normalize";
import { askText, parseYesNo } from "@/lib/textCommands";

// "Ask by text" checklist steps (owner request 2026-10-30): at the step's due time HQ texts the person it's assigned
// to, on their cell from their HQ number; a YES reply checks it off (and its "When done" moves the deal), NO leaves it.
// Sent by the same minute timer as scheduled texts (/api/cron/scheduled-texts).

export async function sendDueAsks(now = new Date()): Promise<number> {
  if (!(await textingEnabled())) return 0;
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const due = (await db.task.findMany({
    where: { askState: "pending", completedAt: null, deletedAt: null, dueDate: { lte: tomorrow } },
    include: { person: { select: { name: true } } }, orderBy: { dueDate: "asc" }, take: 50,
  })).filter((t) => (autoSendAt({ dueDate: t.dueDate, dueTime: t.dueTime ?? "09:00", autoSend: null })?.getTime() ?? Infinity) <= now.getTime()).slice(0, 20);
  let sent = 0;
  for (const t of due) {
    const claim = await db.task.updateMany({ where: { id: t.id, askState: "pending" }, data: { askState: "asked", askedAt: new Date() } });
    if (!claim.count) continue;
    const user = t.assigneeId ? await db.user.findUnique({ where: { id: t.assigneeId }, select: { id: true, textNumber: true, forwardTo: true, status: true } }) : null;
    if (!user?.textNumber || !user.forwardTo || user.status === "DISABLED") {
      // Nobody to text: the step just stays on their list, and they hear about it in the bell.
      await db.task.update({ where: { id: t.id }, data: { askState: "off" } });
      if (user) await db.notification.create({ data: { toId: user.id, personId: t.personId, alert: true, text: `HQ couldn't text you about "${t.title}": add your HQ number and cell in Admin → Integrations. Check it off in HQ when it's done.` } });
      continue;
    }
    const status = t.advanceStatusId ? await db.pipelineStatus.findUnique({ where: { id: t.advanceStatusId }, select: { name: true } }) : null;
    const body = askText({ title: t.title, person: t.person?.name ?? null, movesTo: status?.name ?? null });
    const r = await sendSms({ from: user.textNumber, to: user.forwardTo, body });
    if (!r.ok) { await db.task.update({ where: { id: t.id }, data: { askState: "off" } }); continue; }
    await db.textMessage.create({ data: { ourNumber: user.textNumber, theirNumber: normalizePhone(user.forwardTo), direction: "out", body, twilioSid: r.sid, status: r.status, readAt: new Date() } }).catch(() => null);
    sent++;
  }
  return sent;
}

/**
 * A YES / NO from a team member's cell to their HQ number answers their latest open question (asked in the last three
 * days). Returns the text to reply with, or null when it isn't an answer (then it's handled like any other text).
 */
export async function answerAsk(user: { id: string }, body: string): Promise<string | null> {
  const answer = parseYesNo(body);
  if (!answer) return null;
  const t = await db.task.findFirst({
    where: { assigneeId: user.id, askState: "asked", completedAt: null, deletedAt: null, askedAt: { gte: new Date(Date.now() - 3 * 86400000) } },
    orderBy: { askedAt: "desc" }, include: { person: { select: { name: true } } },
  });
  if (!t) return null;
  const who = t.person ? ` for ${t.person.name}` : "";
  if (answer === "no") {
    await db.task.update({ where: { id: t.id }, data: { askState: "answered" } });
    return `Okay, "${t.title}"${who} stays open in HQ.`;
  }
  const done = await db.task.updateMany({ where: { id: t.id, completedAt: null }, data: { completedAt: new Date(), completedById: user.id, askState: "answered" } });
  if (!done.count) return `"${t.title}"${who} was already checked off.`;
  if (t.personId) await db.timelineEntry.create({ data: { personId: t.personId, kind: "task", body: t.title, taskId: t.id, authorId: user.id } });
  await logActivity(user.id, "update", "task", t.id, `Completed "${t.title}" by text`);
  const moved = await advanceAfterDone(t.id, user.id);
  return `✓ Checked off "${t.title}"${who}.${moved ? ` Moved them to ${moved}.` : ""}`;
}
