import "server-only";
import { db } from "@/server/db";
import { UserError } from "@/server/safe";
import { sendSms } from "@/server/twilio";
import { quickAdd } from "@/server/quickAdd";
import { textingEnabled } from "@/server/integrations";
import { formatPhone, normalizePhone } from "@/lib/normalize";
import { logActivity } from "@/server/activity";
import { publicBase } from "@/server/twilio";
import { COMMAND_HELP, parseTextCommand, parseYesNo, type NewContact } from "@/lib/textCommands";
import { answerAsk } from "@/server/askByText";
import { answerConfirm, pendingConfirm, runTextAgent, undoLast } from "@/server/textAgent";
import { isConnected } from "@/server/integrations";
import { isUndo } from "@/lib/textAgent";

/**
 * A text from a team member's own cell (the "calls ring" cell in Admin) to their own HQ number that starts with
 * "task" or "help" is a command, not a conversation (owner request 2026-10-24). HQ does it and texts back.
 * Returns false for anything else, which is then saved as a normal text.
 */
export async function runTextCommand(o: { from: string; to: string; body: string }): Promise<boolean> {
  const cmd = parseTextCommand(o.body);
  const user = (await db.user.findMany({ where: { textNumber: o.to, forwardTo: { not: null }, status: { not: "DISABLED" } }, select: { id: true, name: true, forwardTo: true } }))
    .find((u) => normalizePhone(u.forwardTo!) === normalizePhone(o.from));
  if (!user) return false;
  if (!cmd) {
    const reply = await notACommand(user, o.body);
    if (!reply) return false;
    await replyTo(o.to, user.forwardTo!, o.from, reply);
    return true;
  }
  let reply = COMMAND_HELP;
  if (cmd.kind === "task") {
    if (!cmd.words) reply = 'Add the task after "task", e.g. task call lender re Ortiz Fri 9am.';
    else {
      try { reply = (await quickAdd(user, { text: cmd.words, view: "today" })).message; }
      catch (e) { reply = e instanceof UserError ? e.message : "That task didn't save. Try again, or add it in HQ."; }
    }
  }
  if (cmd.kind === "contact") {
    try { reply = await addContact(user, cmd.contact); }
    catch { reply = "That contact didn't save. Try again, or add them in HQ."; }
  }
  await replyTo(o.to, user.forwardTo!, o.from, reply);
  return true;
}

/**
 * Anything else from a team member's cell (owner request 2026-10-30): "undo"; YES / NO to a text the assistant prepared
 * (when that's newer than any check-in); a reply to a check-in; otherwise the text assistant. Null = a normal text.
 */
async function notACommand(user: { id: string; name: string }, body: string): Promise<string | null> {
  if (isUndo(body)) return undoLast(user);
  const yn = parseYesNo(body);
  if (yn) {
    const [confirm, asked] = await Promise.all([pendingConfirm(user.id), db.task.findFirst({ where: { assigneeId: user.id, askState: "asked", completedAt: null, deletedAt: null }, orderBy: { askedAt: "desc" }, select: { askedAt: true } })]);
    if (confirm && (!asked?.askedAt || confirm.createdAt > asked.askedAt)) return answerConfirm(user, confirm.id, yn === "yes");
  }
  const answer = await answerAsk(user, body);
  if (answer) return answer;
  return isConnected("claude") ? runTextAgent(user, body) : null;
}

/** The reply is a courtesy: if it can't be sent or saved, the command still counts. */
async function replyTo(ourNumber: string, cell: string, from: string, body: string) {
  if (!(await textingEnabled())) return;
  const r = await sendSms({ from: ourNumber, to: cell, body });
  if (r.ok) await db.textMessage.create({ data: { ourNumber, theirNumber: normalizePhone(from), direction: "out", body, twilioSid: r.sid, status: r.status, readAt: new Date() } }).catch(() => null);
}

/** "contact Jane Smith 612-555-1234 jane@gmail.com" → a new person, unless that number or email is already in HQ. */
async function addContact(user: { id: string }, c: NewContact): Promise<string> {
  if (!c.name) return 'Add a name after "contact", e.g. contact Jane Smith 612-555-1234 jane@gmail.com.';
  const existing = (c.phone || c.email) ? await db.person.findFirst({ where: { deletedAt: null, OR: [
    ...(c.phone ? [{ phones: { some: { normalized: c.phone } } }] : []), ...(c.email ? [{ emails: { some: { normalized: c.email } } }] : []),
  ] }, select: { id: true, name: true } }) : null;
  if (existing) return `${existing.name} is already in HQ with that ${c.phone ? "number" : "email"}: ${publicBase()}/people/${existing.id}`;
  const p = await db.person.create({ data: {
    name: c.name, mailingName: c.name, createdById: user.id, assignedToId: user.id,
    phones: c.phone ? { create: [{ label: "Mobile", number: formatPhone(c.phone), normalized: c.phone, position: 0 }] } : undefined,
    emails: c.email ? { create: [{ label: "", address: c.email, normalized: c.email, position: 0 }] } : undefined,
  } });
  await logActivity(user.id, "create", "person", p.id, `Added ${c.name} by text`);
  return `Added ${c.name}${c.phone ? ` · ${formatPhone(c.phone)}` : ""}${c.email ? ` · ${c.email}` : ""}: ${publicBase()}/people/${p.id}`;
}
