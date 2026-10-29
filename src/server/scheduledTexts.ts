import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/server/db";
import { UserError } from "@/server/safe";
import { namesForNumbers, sendTextAs } from "@/server/texting";
import { groupReady, textNumbersAsGroup } from "@/server/groupText";
import { formatPhone } from "@/lib/normalize";
import { scheduleLabel } from "@/lib/scheduledText";
import { toLabel } from "@/lib/autoSend";
import type { AutoSend } from "@/lib/templates";
import { autoSendAt } from "@/server/autoSend";
import { loadForm } from "@/server/pa";

// Scheduled texts (owner request 2026-10-28): sent from the scheduler's own number within a minute of their time by
// /api/cron/scheduled-texts, which the app calls every minute (src/instrumentation.ts).

/** The key the app's own minute timer sends to the cron route (derived from NEXTAUTH_SECRET, never shown). */
export const cronKey = () => createHash("sha256").update(`cron:${process.env.NEXTAUTH_SECRET ?? ""}`).digest("hex");

export async function sendDueTexts(now = new Date()): Promise<number> {
  const due = await db.scheduledText.findMany({ where: { status: "pending", sendAt: { lte: now } }, orderBy: { sendAt: "asc" }, take: 20 });
  let sent = 0;
  for (const s of due) {
    // Claim it first, so two servers (or two ticks) never send the same text twice.
    const claim = await db.scheduledText.updateMany({ where: { id: s.id, status: "pending" }, data: { status: "sending" } });
    if (!claim.count) continue;
    const user = await db.user.findUnique({ where: { id: s.createdById }, select: { id: true, name: true, status: true } });
    const media = (Array.isArray(s.media) ? s.media : []).filter((x): x is string => typeof x === "string");
    try {
      if (!user || user.status === "DISABLED") throw new Error("The person who scheduled it no longer has access.");
      if (s.numbers.length > 1 && (await groupReady())) await textNumbersAsGroup(user, { numbers: s.numbers, body: s.body, media });
      else for (const n of s.numbers) await sendTextAs(user, { personId: s.personId, to: n, body: s.body, media, typed: true });
      await db.scheduledText.update({ where: { id: s.id }, data: { status: "sent", sentAt: new Date() } });
      if (s.taskId) await db.task.updateMany({ where: { id: s.taskId, completedAt: null }, data: { completedAt: new Date(), completedById: s.createdById } });
      sent++;
    } catch (e) {
      // Our own messages (STOP, no number, daily limit…) are plain English; anything else gets a plain fallback.
      const why = e instanceof UserError || (e instanceof Error && e.message.startsWith("The person")) ? e.message : "Something went wrong sending it. Send it by hand from their page.";
      if (!(e instanceof UserError)) console.error("Scheduled text failed:", s.id, e instanceof Error ? e.name : "error");
      await db.scheduledText.update({ where: { id: s.id }, data: { status: "failed", error: why.slice(0, 300) } });
      // The scheduler hears about it in the bell, with a link to the contact.
      if (user) await db.notification.create({ data: { toId: user.id, personId: s.personId, alert: true, text: `Scheduled text to ${(await namesForNumbers(s.numbers)).join(", ")} (${scheduleLabel(s.sendAt)}) wasn't sent: ${why}` } });
    }
  }
  return sent;
}

/** A contact's scheduled texts not yet sent, and ones that failed in the last week, for the contact page. */
export async function loadScheduledFor(personId: string, userId: string, canCancelAny: boolean) {
  return loadScheduled({ personId }, userId, canCancelAny);
}

/** Scheduled texts from someone's number, for Messages → Scheduled (owner request 2026-10-28). */
export async function loadScheduledBy(createdById: string, userId: string, canCancelAny: boolean) {
  return loadScheduled({ createdById }, userId, canCancelAny);
}

async function loadScheduled(where: { personId?: string; createdById?: string }, userId: string, canCancelAny: boolean) {
  const rows = await db.scheduledText.findMany({ where: { ...where, OR: [{ status: { in: ["pending", "sending"] } }, { status: "failed", sendAt: { gte: new Date(Date.now() - 7 * 86400000) } }] }, orderBy: { sendAt: "asc" } });
  const by = new Map((await db.user.findMany({ where: { id: { in: rows.map((x) => x.createdById) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name.split(" ")[0]]));
  const names = await namesForNumbers([...new Set(rows.flatMap((x) => x.numbers))]);
  const all = [...new Set(rows.flatMap((x) => x.numbers))];
  const nameOf = (n: string) => names[all.indexOf(n)] ?? n;
  const texts = rows.map((x) => ({ id: x.id, at: x.sendAt.getTime(), when: scheduleLabel(x.sendAt), to: [...new Set(x.numbers.map(nameOf))].join(", "), body: x.body, by: by.get(x.createdById) ?? "", mine: x.createdById === userId || canCancelAny, status: x.status, error: x.error, personId: x.personId, auto: false }));
  const autos = await loadAutoSteps(where, userId, canCancelAny);
  return [...texts, ...autos].sort((a, b) => a.at - b.at);
}

/** Checklist steps that send by themselves (owner request 2026-10-29), listed with the scheduled texts. On a contact page
 *  both texts and emails; in Messages only the texts that go out from that person's number. Id "task:<id>". */
async function loadAutoSteps(where: { personId?: string; createdById?: string }, userId: string, canCancelAny: boolean) {
  const tasks = await db.task.findMany({
    where: { autoState: { in: ["pending", "sending", "failed"] }, completedAt: null, deletedAt: null, ...(where.personId ? { personId: where.personId } : { kind: "text" }) },
    include: { person: { select: { name: true } } }, orderBy: { dueDate: "asc" }, take: 100,
  });
  if (!tasks.length) return [];
  const team = await db.user.findMany({ select: { id: true, name: true } });
  const first = (id: string | null) => team.find((u) => u.id === id)?.name.split(" ")[0] ?? "";
  const roles = new Map([...(await loadForm("buyer")), ...(await loadForm("seller"))].filter((s) => s.people).map((s) => [`people:${s.id}`, s.name]));
  return tasks.flatMap((t) => {
    const auto = t.autoSend as AutoSend | null;
    if (!auto || !Array.isArray(auto.to)) return [];
    const from = auto.from || first(t.assigneeId);
    if (where.createdById && from.toLowerCase() !== first(where.createdById).toLowerCase()) return [];
    const at = autoSendAt(t);
    return [{
      id: `task:${t.id}`, at: at?.getTime() ?? Infinity, when: at ? scheduleLabel(at) : "No date yet",
      to: toLabel(auto.to, { client: t.person?.name ?? "Client", ...Object.fromEntries(roles) }),
      body: `Automatic ${t.kind === "email" ? "email" : "text"} from the checklist: ${t.title}`, by: from,
      mine: canCancelAny || t.assigneeId === userId || first(userId).toLowerCase() === from.toLowerCase(),
      status: t.autoState === "failed" ? "failed" : "pending", error: t.autoError, personId: t.personId, auto: true,
    }];
  });
}
