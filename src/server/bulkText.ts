import "server-only";
import { db } from "@/server/db";
import { logActivity } from "@/server/activity";
import { mergeFor } from "@/server/merge";
import { dailyCap, sendTextAs } from "@/server/texting";
import { groupReady, textNumbersAsGroup } from "@/server/groupText";
import { textingEnabled } from "@/server/integrations";
import { UserError } from "@/server/safe";
import type { SessionUser } from "@/server/auth";
import { fill } from "@/lib/merge";
import { centralDayStart, TEXT_STOP_TAG } from "@/lib/texting";
import { inBulkHours, nextAfterSend, nextBulkStart, pickTextRecipients, tomorrowStart, withOptOut } from "@/lib/bulkText";

// Mass text from People (SPEC.md §6.2, owner request 2026-11-06). The minute timer sends at most one text per send
// each tick, a random 1–2 minutes apart, 9am–7pm Central, and stops for the day at the sender's daily cap.

export async function bulkTextPeople(personIds: string[]) {
  const people = await db.person.findMany({ where: { id: { in: personIds }, deletedAt: null }, select: { id: true, name: true, phones: { orderBy: { position: "asc" }, select: { number: true } }, tags: { select: { tag: { select: { name: true } } } } } });
  const byId = new Map(people.map((p) => [p.id, p]));
  // Keep the order they were picked in.
  return pickTextRecipients(personIds.map((id) => byId.get(id)).filter((p) => !!p).map((p) => ({ id: p!.id, name: p!.name, phones: p!.phones.map((x) => x.number), tags: p!.tags.map((t) => t.tag.name) })), TEXT_STOP_TAG);
}

/** One contact: a plain text to their one number, or one group text to all of theirs (a couple). */
async function sendOne(user: SessionUser, personId: string, numbers: string[], body: string, media: string[]) {
  if (numbers.length > 1 && (await groupReady())) { await textNumbersAsGroup(user, { numbers, body, media }); return "group"; }
  // Group texts off in Admin → Integrations: the first number only, so a couple doesn't get it twice.
  await sendTextAs(user, { personId, to: numbers[0], body, media });
  return numbers.length > 1 ? "first" : "one";
}

const list = <T,>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);

/** The minute timer: one text for each mass text that's due. Returns texts sent. */
export async function sendBulkTexts(now = new Date()): Promise<number> {
  const jobs = await db.bulkTextJob.findMany({ where: { state: "sending", nextAt: { lte: now } }, orderBy: { createdAt: "asc" }, take: 5 });
  let total = 0;
  for (const j of jobs) {
    const claim = await db.bulkTextJob.updateMany({ where: { id: j.id, state: "sending", OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] }, data: { lockedUntil: new Date(now.getTime() + 3 * 60000) } });
    if (!claim.count) continue;
    const save = (data: Record<string, unknown>) => db.bulkTextJob.update({ where: { id: j.id }, data: { ...data, lockedUntil: null } });
    try {
      if (!inBulkHours(now)) { await save({ nextAt: nextBulkStart(now) }); continue; }
      const u = await db.user.findUnique({ where: { id: j.userId }, include: { role: true } });
      if (!u || u.status === "DISABLED") { await save({ state: "stopped", error: "The person sending it can't sign in any more." }); continue; }
      if (!(await textingEnabled()) || !u.textNumber) { await save({ state: "stopped", error: "Texting is off, or there's no HQ number to send from (Admin → Integrations)." }); continue; }
      // At the daily cap: wait for tomorrow morning (texts the sender sends by hand count too).
      const sentToday = await db.textMessage.count({ where: { ourNumber: u.textNumber, direction: "out", createdAt: { gte: centralDayStart(now) } } });
      if (sentToday >= (await dailyCap())) { await save({ nextAt: tomorrowStart(now) }); continue; }
      const user: SessionUser = { id: u.id, name: u.name, email: u.email, role: u.role.name, permissions: u.role.permissions, isOwner: u.isOwner };
      const done = new Set(list<string>(j.doneIds));
      const nextId = list<string>(j.personIds).find((id) => !done.has(id));
      if (!nextId) { await save({ state: "done" }); continue; }
      // Checked again now: they may have replied STOP or lost their number since it started.
      const { send } = await bulkTextPeople([nextId]);
      const failed = list<{ name: string; error: string }>(j.failed);
      let sent = 0, skipped = 0;
      if (!send.length) skipped = 1;
      else {
        const r = send[0];
        const { values } = await mergeFor(user, r.personId);
        try { await sendOne(user, r.personId, r.numbers, withOptOut(fill(j.body, values).text), list<string>(j.media)); sent = 1; }
        catch (e) {
          // The daily cap reached from a text sent by hand in the meantime: try them again tomorrow.
          if (e instanceof UserError && /today's limit/i.test(e.message)) { await save({ nextAt: tomorrowStart(now) }); continue; }
          // Anything else: noted as didn't send, and on to the next person (one bad number never stalls the rest).
          if (!(e instanceof UserError)) console.error("Mass text: one didn't send:", e instanceof Error ? `${e.name} ${(e as { code?: string }).code ?? ""}`.trim() : "error");
          failed.push({ name: r.name, error: e instanceof UserError ? e.message : "Something went wrong sending to them." });
        }
      }
      const doneIds = [...done, nextId];
      const finished = doneIds.length >= list(j.personIds).length;
      await save({ doneIds, sent: j.sent + sent, skipped: j.skipped + skipped, failed: failed.slice(-500), state: finished ? "done" : "sending", error: null, nextAt: nextAfterSend(now) });
      total += sent;
      if (finished) await logActivity(u.id, "create", "text", null, `Mass text sent to ${j.sent + sent} ${j.sent + sent === 1 ? "contact" : "contacts"}`);
    } catch (e) {
      await save({ error: e instanceof Error ? e.message.slice(0, 300) : "Something went wrong; trying again.", nextAt: new Date(now.getTime() + 5 * 60000) });
    }
  }
  return total;
}
