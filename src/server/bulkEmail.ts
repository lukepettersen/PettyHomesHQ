import "server-only";
import type { z } from "zod";
import { db } from "@/server/db";
import { logActivity } from "@/server/activity";
import { mergeFor } from "@/server/merge";
import { emailConnection, sendGmail } from "@/server/google";
import { publicBase } from "@/server/twilio";
import { attachmentList, loadAttachments } from "@/server/attachments";
import type { SessionUser } from "@/server/auth";
import { fill } from "@/lib/merge";
import { toPlain } from "@/lib/email";
import { bulkFooter, pickRecipients, unsubToken } from "@/lib/bulkEmail";

// Mass email from People (SPEC.md §6.2), sent in the background by the minute timer (owner report 2026-11-02: a send
// from the browser stopped at 55 of 241 when HQ restarted). Closing the tab, sleep or an update no longer stops it.

/** About 40 a minute: under Gmail's per-minute limit, and a tick finishes well inside a minute. */
export const PER_TICK = 40;

export async function bulkPeople(personIds: string[], kind?: string) {
  const people = await db.person.findMany({ where: { id: { in: personIds }, deletedAt: null }, select: { id: true, name: true, emails: { orderBy: { position: "asc" }, select: { address: true } }, tags: { select: { tag: { select: { name: true } } } } } });
  return pickRecipients(people.map((p) => ({ id: p.id, name: p.name, emails: p.emails.map((e) => e.address), tags: p.tags.map((t) => t.tag.name) })), kind);
}

type Job = { userId: string; kind: string; subject: string; body: string; address: string; signature: boolean; batch: string; attachments: z.infer<typeof attachmentList> };

/** Sends one group. Anyone unsubscribed (now), with no email, or who already got this subject in 24 hours is skipped. */
async function sendGroup(user: SessionUser, v: Job, personIds: string[]) {
  const secret = process.env.NEXTAUTH_SECRET ?? "";
  const { send: all } = await bulkPeople(personIds, v.kind);
  const had = new Set((await db.emailTrack.findMany({ where: { personId: { in: all.map((r) => r.personId) }, subject: v.subject, sentAt: { gte: new Date(Date.now() - 86400000) } }, select: { personId: true } })).map((t) => t.personId));
  const send = all.filter((r) => !had.has(r.personId));
  const files = await loadAttachments(v.attachments);
  const done: string[] = personIds.filter((id) => !send.some((r) => r.personId === id)); // skipped ones count as handled
  const failed: { name: string; error: string }[] = [];
  let sent = 0, slowDown = false, stop: string | null = null;
  for (const r of send) {
    const { values } = await mergeFor(user, r.personId);
    const subject = fill(v.subject, values).text;
    const url = `${publicBase()}/unsubscribe?p=${r.personId}&t=${unsubToken(r.personId, secret)}&k=${encodeURIComponent(v.kind)}`;
    const body = fill(v.body, values).text + bulkFooter(v.address, url);
    const track = await db.emailTrack.create({ data: { batch: v.batch, subject: v.subject, personId: r.personId, sentById: user.id } });
    const res = await sendGmail({ to: [r.email], subject, body, signature: v.signature, pixelUrl: `${publicBase()}/api/e/${track.id}.gif`, attachments: files, asUserId: user.id });
    if (!res.ok) {
      await db.emailTrack.delete({ where: { id: track.id } });
      if (/quota|rate ?limit|too many|429/i.test(res.error)) { slowDown = true; break; } // this one and the rest go after a pause
      if (/isn't connected|didn't let HQ in/i.test(res.error)) { stop = res.error; break; }
      failed.push({ name: r.name, error: res.error }); done.push(r.personId);
      continue;
    }
    sent++; done.push(r.personId);
    const [entry] = await db.$transaction([
      db.timelineEntry.create({ data: { personId: r.personId, kind: "email", gmailId: res.id ? `${res.id}:${r.personId}` : null, body: `To ${r.email} · ${subject}\n\n${toPlain(fill(v.body, values).text)}${files.length ? `\n\n📎 ${files.map((f) => f.name).join(", ")}` : ""}`, authorId: user.id } }),
      db.person.update({ where: { id: r.personId }, data: { lastContactAt: new Date() } }),
    ]);
    await db.emailTrack.update({ where: { id: track.id }, data: { entryId: entry.id } });
  }
  return { done, sent, skipped: had.size, failed, slowDown, stop };
}

const list = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);

/** The minute timer: works through mass emails being sent, a group per send each tick. Returns emails sent. */
export async function sendBulkJobs(now = new Date()): Promise<number> {
  const jobs = await db.bulkEmailJob.findMany({ where: { state: "sending", OR: [{ waitUntil: null }, { waitUntil: { lte: now } }] }, orderBy: { createdAt: "asc" }, take: 3 });
  let total = 0;
  for (const j of jobs) {
    // Only one tick works on a send at a time (a slow tick can overlap the next one).
    const claim = await db.bulkEmailJob.updateMany({ where: { id: j.id, state: "sending", OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] }, data: { lockedUntil: new Date(now.getTime() + 5 * 60000) } });
    if (!claim.count) continue;
    try {
      const u = await db.user.findUnique({ where: { id: j.userId }, include: { role: true } });
      const finish = async (data: { state: string; error?: string | null }) => db.bulkEmailJob.update({ where: { id: j.id }, data: { ...data, lockedUntil: null } });
      if (!u || u.status === "DISABLED") { await finish({ state: "stopped", error: "The person sending it can't sign in any more." }); continue; }
      if (!(await emailConnection(u.id))) { await finish({ state: "stopped", error: "Gmail isn't connected. An Admin can reconnect Google in Admin → Integrations." }); continue; }
      const user: SessionUser = { id: u.id, name: u.name, email: u.email, role: u.role.name, permissions: u.role.permissions, isOwner: u.isOwner };
      const doneSet = new Set(list(j.doneIds));
      const next = list(j.personIds).filter((id) => !doneSet.has(id)).slice(0, PER_TICK);
      if (!next.length) { await finish({ state: "done" }); continue; }
      const r = await sendGroup(user, { userId: u.id, kind: j.kind, subject: j.subject, body: j.body, address: j.address, signature: j.signature, batch: j.batch, attachments: j.attachments as Job["attachments"] }, next);
      total += r.sent;
      const doneIds = [...doneSet, ...r.done];
      const left = list(j.personIds).length - doneIds.length;
      const state = r.stop ? "stopped" : left <= 0 ? "done" : "sending";
      await db.bulkEmailJob.update({ where: { id: j.id }, data: {
        doneIds, sent: j.sent + r.sent, skipped: j.skipped + r.skipped, failed: [...(j.failed as object[]), ...r.failed].slice(0, 500),
        state, error: r.stop, waitUntil: r.slowDown ? new Date(Date.now() + 65000) : null, lockedUntil: null } });
      if (state === "done") await logActivity(u.id, "create", "email", null, `Mass email (${j.kind}) "${j.subject}" sent to ${j.sent + r.sent} ${j.sent + r.sent === 1 ? "person" : "people"}`);
    } catch (e) {
      await db.bulkEmailJob.update({ where: { id: j.id }, data: { lockedUntil: null, error: e instanceof Error ? e.message.slice(0, 300) : "Something went wrong; trying again." } });
    }
  }
  return total;
}
