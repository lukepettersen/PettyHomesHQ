import "server-only";
import { db } from "@/server/db";
import { UserError } from "@/server/safe";
import { sendSms } from "@/server/twilio";
import { quickAdd } from "@/server/quickAdd";
import { textingEnabled } from "@/server/integrations";
import { normalizePhone } from "@/lib/normalize";
import { COMMAND_HELP, parseTextCommand } from "@/lib/textCommands";

/**
 * A text from a team member's own cell (the "calls ring" cell in Admin) to their own HQ number that starts with
 * "task" or "help" is a command, not a conversation (owner request 2026-10-24). HQ does it and texts back.
 * Returns false for anything else, which is then saved as a normal text.
 */
export async function runTextCommand(o: { from: string; to: string; body: string }): Promise<boolean> {
  const cmd = parseTextCommand(o.body);
  if (!cmd) return false;
  const user = (await db.user.findMany({ where: { textNumber: o.to, forwardTo: { not: null }, status: { not: "DISABLED" } }, select: { id: true, name: true, forwardTo: true } }))
    .find((u) => normalizePhone(u.forwardTo!) === normalizePhone(o.from));
  if (!user) return false;
  let reply = COMMAND_HELP;
  if (cmd.kind === "task") {
    if (!cmd.words) reply = 'Add the task after "task", e.g. task call lender re Ortiz Fri 9am.';
    else {
      try { reply = (await quickAdd(user, { text: cmd.words, view: "today" })).message; }
      catch (e) { reply = e instanceof UserError ? e.message : "That task didn't save. Try again, or add it in HQ."; }
    }
  }
  // The reply is a courtesy: if it can't be sent or saved, the command still counts.
  if (await textingEnabled()) {
    const r = await sendSms({ from: o.to, to: user.forwardTo!, body: reply });
    if (r.ok) await db.textMessage.create({ data: { ourNumber: o.to, theirNumber: normalizePhone(o.from), direction: "out", body: reply, twilioSid: r.sid, status: r.status, readAt: new Date() } }).catch(() => null);
  }
  return true;
}
