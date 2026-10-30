import "server-only";
import { db } from "@/server/db";
import { sendSms } from "@/server/twilio";
import { textingEnabled } from "@/server/integrations";
import { logActivity } from "@/server/activity";
import { advanceAfterDone } from "@/server/automation";
import { autoSendAt } from "@/server/autoSend";
import { askText, parseConsultReply, parseYesNo } from "@/lib/textCommands";
import { isoFromDate, normalizePhone, todayCentral } from "@/lib/normalize";
import { addMinutes, apptLabel, defaultTitle } from "@/lib/appointments";
import { formatTime, longIso } from "@/lib/tasks";
import { loadApptTypes } from "@/server/appointments";
import { bookAppt } from "@/server/booking";
import { calendarConnection } from "@/server/google";

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
    const body = await askBody(t);
    const r = await sendSms({ from: user.textNumber, to: user.forwardTo, body });
    if (!r.ok) { await db.task.update({ where: { id: t.id }, data: { askState: "off" } }); continue; }
    await db.textMessage.create({ data: { ourNumber: user.textNumber, theirNumber: normalizePhone(user.forwardTo), direction: "out", body, twilioSid: r.sid, status: r.status, readAt: new Date() } }).catch(() => null);
    sent++;
  }
  return sent;
}

/** The check-in text for an "Ask by text" step (also shown ahead of time in the contact's Scheduled box). */
export async function askBody(t: { title: string; askKind: string | null; advanceStatusId: string | null; person: { name: string } | null }) {
  if (t.askKind === "consult") return `HQ check-in${t.person ? ` for ${t.person.name}` : ""}: did you set a consult? Reply like "buyer Wed 7pm" or "seller Thu 3:30pm" and HQ books it and sends the invite, or NO.`;
  const status = t.advanceStatusId ? await db.pipelineStatus.findUnique({ where: { id: t.advanceStatusId }, select: { name: true } }) : null;
  return askText({ title: t.title, person: t.person?.name ?? null, movesTo: status?.name ?? null });
}

/**
 * A YES / NO from a team member's cell to their HQ number answers their latest open question (asked in the last three
 * days). Returns the text to reply with, or null when it isn't an answer (then it's handled like any other text).
 */
export async function answerAsk(user: { id: string }, body: string): Promise<string | null> {
  const t = await db.task.findFirst({
    where: { assigneeId: user.id, askState: "asked", completedAt: null, deletedAt: null, askedAt: { gte: new Date(Date.now() - 3 * 86400000) } },
    orderBy: { askedAt: "desc" }, include: { person: { select: { id: true, name: true, address: true, emails: { orderBy: { position: "asc" }, select: { address: true } } } } },
  });
  if (!t) return null;
  if (t.askKind === "consult") return answerConsult(user, t, body);
  const answer = parseYesNo(body);
  if (!answer) return null;
  const who = t.person ? ` for ${t.person.name}` : "";
  if (answer === "no") {
    await db.task.update({ where: { id: t.id }, data: { askState: "answered" } });
    return `Okay, "${t.title}"${who} stays open in HQ.`;
  }
  const r = await checkOff(user, t);
  if (!r.done) return `"${t.title}"${who} was already checked off.`;
  return `✓ Checked off "${t.title}"${who}.${r.moved ? ` Moved them to ${r.moved}.` : ""}`;
}

/** Checks the step off as that person (timeline, activity, then its "When done"). */
async function checkOff(user: { id: string }, t: { id: string; title: string; personId: string | null }) {
  const done = await db.task.updateMany({ where: { id: t.id, completedAt: null }, data: { completedAt: new Date(), completedById: user.id, askState: "answered" } });
  if (!done.count) return { done: false, moved: null };
  if (t.personId) await db.timelineEntry.create({ data: { personId: t.personId, kind: "task", body: t.title, taskId: t.id, authorId: user.id } });
  await logActivity(user.id, "update", "task", t.id, `Completed "${t.title}" by text`);
  return { done: true, moved: await advanceAfterDone(t.id, user.id) };
}

const HOW = 'Reply like "buyer Wed 7pm" or "seller Thu 3:30pm", or NO.';

/**
 * "Did you set a consult?" (owner request 2026-10-30): a reply with a day and time books a Buyer or Seller consult on
 * their page, just like Book (calendar invite to them and the team, the consult checklist starts), then checks the step
 * off. Anything missing gets one question back instead of a guess.
 */
async function answerConsult(user: { id: string }, t: { id: string; title: string; personId: string | null; fileId: string | null; person: { id: string; name: string; address: string | null; emails: { address: string }[] } | null }, body: string): Promise<string | null> {
  const today = isoFromDate(todayCentral());
  const r = parseConsultReply(body, today);
  if (!r) return parseYesNo(body) === "yes" ? `Great, when is it? ${HOW}` : null; // anything else is a normal text
  const who = t.person ? ` for ${t.person.name}` : "";
  if (r.kind === "no") {
    await db.task.update({ where: { id: t.id }, data: { askState: "answered" } });
    return `Okay, no consult booked${who}. "${t.title}" stays open in HQ.`;
  }
  if (!t.person) return null;
  // Buyer or seller: what they said, else the one kind of open deal they have.
  const kinds = [...new Set((await db.clientFile.findMany({ where: { personId: t.person.id, deletedAt: null, closedAt: null }, select: { kind: true } })).map((f) => f.kind))];
  const type = r.type ?? (kinds.length === 1 ? (kinds[0] === "listing" ? "seller" : "buyer") : null);
  if (!type) return `Is it a buyer or seller consult? ${HOW}`;
  if (!r.date || !r.time) return `What ${!r.date && !r.time ? "day and time" : !r.date ? "day" : "time"}? ${HOW}`;
  if (r.date < today) return `That day has passed. ${HOW}`;
  const types = await loadApptTypes();
  const mins = types.find((x) => x.key === type)?.mins ?? 60;
  const team = await db.user.findMany({ where: { status: { not: "DISABLED" } }, orderBy: [{ isOwner: "desc" }, { name: "asc" }], select: { name: true } });
  // Same defaults as the Book button: their emails and the team invited; a seller consult is at their address.
  const end = addMinutes(r.time, mins);
  await bookAppt(user.id, {
    personId: t.person.id, type, title: defaultTitle(t.person.name, type, types), date: r.date, start: r.time, end,
    location: type === "seller" ? t.person.address ?? "" : "", invitees: [...t.person.emails.map((e) => e.address), ...team.map((u) => u.name)],
  });
  const done = await checkOff(user, t);
  const invite = (await calendarConnection()) ? " Invite sent." : "";
  return `✓ Booked ${apptLabel(type, types)}${who}, ${longIso(r.date)} ${formatTime(r.time)}–${formatTime(end)}.${invite}${done.moved ? ` Moved them to ${done.moved}.` : ""}`;
}
