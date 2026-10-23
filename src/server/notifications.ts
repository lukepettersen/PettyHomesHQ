import "server-only";
import { db } from "@/server/db";
import { emailConnection, sendGmail } from "@/server/google";
import { shortDate } from "@/lib/normalize";
import { clock } from "@/lib/files";

export type BellItem = { id: string; text: string; personId: string | null; link: string | null; at: string; read: boolean; alert: boolean };

/** The signed-in user's latest mentions for the bell. */
export async function loadBell(userId: string): Promise<{ unread: number; items: BellItem[] }> {
  const [unread, items] = await Promise.all([
    db.notification.count({ where: { toId: userId, readAt: null } }),
    db.notification.findMany({ where: { toId: userId }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return { unread, items: items.map((n) => ({ id: n.id, text: n.text, personId: n.personId, link: n.link, at: n.createdAt.toISOString(), read: !!n.readAt, alert: n.alert })) };
}

/**
 * Someone gave a teammate a task (new, or reassigned to them): a bell alert and, when Gmail is connected, an email
 * to their pettyhomes.com address with a link to the task (owner request 2026-10-23). Tasks people give themselves
 * and steps from task templates don't notify. A failed email never undoes the change.
 */
export async function notifyAssigned(by: { id: string; name: string }, taskId: string) {
  const t = await db.task.findUnique({ where: { id: taskId }, include: { assignee: { select: { id: true, name: true, email: true, status: true } }, person: { select: { name: true } } } });
  if (!t?.assignee || t.assignee.id === by.id || t.assignee.status === "DISABLED") return;
  const due = t.dueDate ? ` · due ${shortDate(t.dueDate)}${t.dueTime ? ` ${clock(t.dueTime)}` : ""}` : "";
  const what = `${t.title}${t.person ? ` · ${t.person.name}` : ""}${due}`;
  const from = by.name.split(" ")[0];
  await db.notification.create({ data: { toId: t.assignee.id, fromId: by.id, personId: t.personId, link: `/tasks?task=${t.id}`, text: `${from} gave you a task: ${what}` } });
  try {
    if (!(await emailConnection())) return;
    const link = `${(process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "")}/tasks?task=${t.id}`;
    await sendGmail({ to: [t.assignee.email], subject: `New task from ${from}: ${t.title}`, body: `${from} gave you a task in HQ:\n\n${what}${t.notes ? `\n\n${t.notes}` : ""}\n\nOpen it: ${link}`, signature: false });
  } catch { /* the bell already has it */ }
}
