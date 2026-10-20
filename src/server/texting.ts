import "server-only";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { isConnected, textingEnabled } from "@/server/integrations";
import { hasPermission } from "@/server/permissions";
import type { SessionUser } from "@/server/auth";
import { sendSms } from "@/server/twilio";
import { formatPhone, normalizePhone } from "@/lib/normalize";
import { centralDayStart, DEFAULT_DAILY_CAP, isStartWord, isStopWord, MAX_TEXT, toE164 } from "@/lib/texting";

// Business texting (SPEC.md §11). Each team member has their own Twilio number (owner, 2026-10-20). Texts and
// missed calls are TextMessage rows; texts with a known contact also go on their timeline and count as a touch.
// Message bodies are never written to logs.

const UNSUB = "Unsubscribed";
const snippet = (s: string) => (s.length > 120 ? `${s.slice(0, 120)}…` : s);

export async function dailyCap(): Promise<number> {
  const row = await db.appSetting.findUnique({ where: { key: "texting.dailyCap" } });
  const n = Number(row?.value);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_DAILY_CAP;
}

/** The newest contact with this phone number (digits only), if any. */
export async function personForNumber(digits: string) {
  if (!digits) return null;
  const phone = await db.phone.findFirst({ where: { normalized: digits, person: { deletedAt: null } }, orderBy: { person: { updatedAt: "desc" } }, select: { person: { select: { id: true, name: true } } } });
  return phone?.person ?? null;
}

const lineOwner = (ourNumber: string) => db.user.findFirst({ where: { textNumber: ourNumber, status: { not: "DISABLED" } }, select: { id: true, name: true, forwardTo: true } });

async function setUnsubscribed(personId: string, on: boolean) {
  const tag = await db.tag.upsert({ where: { name: UNSUB }, create: { name: UNSUB }, update: {} });
  if (on) await db.personTag.upsert({ where: { personId_tagId: { personId, tagId: tag.id } }, create: { personId, tagId: tag.id }, update: {} });
  else await db.personTag.deleteMany({ where: { personId, tagId: tag.id } });
}
export async function isUnsubscribed(personId: string) {
  return (await db.personTag.count({ where: { personId, tag: { name: UNSUB } } })) > 0;
}

/** A text that came in (from Twilio's webhook). STOP tags them Unsubscribed; START/YES removes it. */
export async function recordIncoming(o: { from: string; to: string; body: string; sid: string }) {
  const theirs = normalizePhone(o.from);
  if (await db.textMessage.findUnique({ where: { twilioSid: o.sid } })) return; // Twilio retried
  const [owner, person] = await Promise.all([lineOwner(o.to), personForNumber(theirs)]);
  const body = o.body.slice(0, 5000);
  await db.textMessage.create({ data: { ourNumber: o.to, theirNumber: theirs, personId: person?.id ?? null, direction: "in", body, twilioSid: o.sid, status: "received" } });
  if (person) {
    let extra = "";
    if (isStopWord(body)) { await setUnsubscribed(person.id, true); extra = " They replied STOP: tagged Unsubscribed, and texts to them are blocked."; }
    else if (isStartWord(body) && (await isUnsubscribed(person.id))) { await setUnsubscribed(person.id, false); extra = " They opted back in: Unsubscribed tag removed."; }
    await db.$transaction([
      db.timelineEntry.create({ data: { personId: person.id, kind: "text", outcome: "Received", body } }),
      db.person.update({ where: { id: person.id }, data: { lastTextAt: new Date(), lastContactAt: new Date() } }),
      ...(extra ? [db.timelineEntry.create({ data: { personId: person.id, kind: "system", body: extra.trim() } })] : []),
    ]);
  }
  if (owner) {
    const who = person?.name ?? formatPhone(theirs);
    await db.notification.create({ data: { toId: owner.id, personId: person?.id ?? null, alert: true, link: `/messages?n=${theirs}`, text: `Text from ${who}: "${snippet(body)}"` } });
  }
  if (person) revalidatePath(`/people/${person.id}`);
}

/** A call that nobody answered (or a number without call forwarding). */
export async function recordMissedCall(o: { from: string; to: string; sid: string }) {
  const theirs = normalizePhone(o.from);
  const key = `call:${o.sid}`;
  if (await db.textMessage.findUnique({ where: { twilioSid: key } })) return;
  const [owner, person] = await Promise.all([lineOwner(o.to), personForNumber(theirs)]);
  await db.textMessage.create({ data: { ourNumber: o.to, theirNumber: theirs, personId: person?.id ?? null, direction: "in", kind: "missed_call", twilioSid: key, status: "received" } });
  if (person) await db.timelineEntry.create({ data: { personId: person.id, kind: "call", outcome: "Missed call", body: `Called ${owner ? `${owner.name.split(" ")[0]}'s` : "the"} business number (${formatPhone(o.to)}).` } });
  if (owner) await db.notification.create({ data: { toId: owner.id, personId: person?.id ?? null, alert: true, link: `/messages?n=${theirs}`, text: `Missed call from ${person?.name ?? formatPhone(theirs)}` } });
}

export async function updateStatus(sid: string, status: string, errorCode?: string | null) {
  await db.textMessage.updateMany({ where: { twilioSid: sid }, data: { status: status.slice(0, 20), ...(errorCode ? { error: errorCode.slice(0, 10) } : {}) } });
}

/**
 * Sends a text from the user's own number, typed by them (so quiet hours don't apply; they hold only automatic
 * texts). To a phone saved on the contact, or back to a number that texted this line. Never to Unsubscribed.
 */
export async function sendTextAs(user: { id: string; name: string }, o: { personId: string | null; to: string; body: string; typed?: boolean }) {
  if (!(await textingEnabled())) throw new UserError("Texting is off. An Admin can turn it on in Admin → Integrations.");
  const me = await db.user.findUnique({ where: { id: user.id }, select: { textNumber: true } });
  if (!me?.textNumber) throw new UserError("You don't have a texting number yet. An Admin can add it in Admin → Integrations.");
  const body = o.body.trim();
  if (!body) throw new UserError("Write a message.");
  if (body.length > MAX_TEXT) throw new UserError(`Texts can be up to ${MAX_TEXT} characters.`);
  const theirs = normalizePhone(o.to);
  const to = toE164(theirs);
  if (!to) throw new UserError("That isn't a US phone number.");
  let person = o.personId ? await db.person.findFirst({ where: { id: o.personId, deletedAt: null }, select: { id: true, name: true, phones: { select: { normalized: true } } } }) : null;
  if (o.personId && !person) throw new UserError("That person was deleted.");
  if (person && !person.phones.some((p) => p.normalized === theirs)) throw new UserError(`HQ only texts numbers saved on ${person.name}. Add the number to their contact first.`);
  if (!person) {
    const texted = await db.textMessage.count({ where: { ourNumber: me.textNumber, theirNumber: theirs, direction: "in" } });
    // A number typed in on purpose ("+ Add" on Send text) is allowed; otherwise only replies to people who texted first.
    if (!texted && !o.typed) throw new UserError("HQ only texts saved contacts, or people who texted your number first.");
    const p = await personForNumber(theirs);
    person = p ? { ...p, phones: [] } : null;
  }
  if (person && (await isUnsubscribed(person.id))) throw new UserError(`${person.name} is tagged Unsubscribed, so HQ won't text them.`);
  const cap = await dailyCap();
  const sentToday = await db.textMessage.count({ where: { ourNumber: me.textNumber, direction: "out", createdAt: { gte: centralDayStart() } } });
  if (sentToday >= cap) throw new UserError(`You've reached today's limit of ${cap} texts from your number. It resets at midnight (Admin → Integrations to change it).`);

  const r = await sendSms({ from: me.textNumber, to, body });
  if (!r.ok) throw new UserError(r.error);
  await db.textMessage.create({ data: { ourNumber: me.textNumber, theirNumber: theirs, personId: person?.id ?? null, direction: "out", body, twilioSid: r.sid, status: r.status, sentById: user.id, readAt: new Date() } });
  if (person) {
    await db.$transaction([
      db.timelineEntry.create({ data: { personId: person.id, kind: "text", outcome: "Sent", body, authorId: user.id } }),
      db.person.update({ where: { id: person.id }, data: { lastTextAt: new Date(), lastContactAt: new Date() } }),
    ]);
    revalidatePath(`/people/${person.id}`);
  }
  await logActivity(user.id, "create", "text", person?.id ?? null, `Texted ${person?.name ?? formatPhone(theirs)}`);
  revalidatePath("/messages");
  return { name: person?.name ?? formatPhone(theirs) };
}

// ---------- Messages page ----------
export type Thread = { number: string; personId: string | null; name: string; last: string; lastKind: string; lastDir: string; at: string; unread: number };
export type Bubble = { id: string; direction: string; kind: string; body: string; status: string; error: string | null; by: string | null; at: string };

export async function loadThreads(ourNumber: string): Promise<Thread[]> {
  const latest = await db.textMessage.findMany({ where: { ourNumber }, orderBy: { createdAt: "desc" }, distinct: ["theirNumber"], take: 300, include: { person: { select: { id: true, name: true, deletedAt: true } } } });
  const unread = await db.textMessage.groupBy({ by: ["theirNumber"], where: { ourNumber, direction: "in", readAt: null }, _count: true });
  const unreadBy = new Map(unread.map((u) => [u.theirNumber, u._count]));
  const people = new Map<string, { id: string; name: string } | null>();
  for (const m of latest) if (!m.person || m.person.deletedAt) people.set(m.theirNumber, await personForNumber(m.theirNumber));
  return latest.map((m) => {
    const p = m.person && !m.person.deletedAt ? m.person : people.get(m.theirNumber) ?? null;
    return { number: m.theirNumber, personId: p?.id ?? null, name: p?.name ?? formatPhone(m.theirNumber), last: m.kind === "missed_call" ? "Missed call" : m.body, lastKind: m.kind, lastDir: m.direction, at: m.createdAt.toISOString(), unread: unreadBy.get(m.theirNumber) ?? 0 };
  });
}

export async function loadConversation(ourNumber: string, theirNumber: string): Promise<Bubble[]> {
  const rows = await db.textMessage.findMany({ where: { ourNumber, theirNumber }, orderBy: { createdAt: "asc" }, take: 500, include: { sentBy: { select: { name: true } } } });
  return rows.map((m) => ({ id: m.id, direction: m.direction, kind: m.kind, body: m.body, status: m.status, error: m.error, by: m.sentBy?.name.split(" ")[0] ?? null, at: m.createdAt.toISOString() }));
}

/** Unread texts and missed calls on the user's number, for the Messages tab. */
export async function unreadCount(userId: string): Promise<number> {
  const me = await db.user.findUnique({ where: { id: userId }, select: { textNumber: true } });
  return me?.textNumber ? db.textMessage.count({ where: { ourNumber: me.textNumber, direction: "in", readAt: null } }) : 0;
}

/** What the Send text box needs: the user's number, text templates, and why it's unavailable (if it is). */
export async function textComposerFor(user: SessionUser, unsubscribedName?: string | null) {
  const [enabled, me, templates] = await Promise.all([
    textingEnabled(), db.user.findUnique({ where: { id: user.id }, select: { textNumber: true } }),
    db.messageTemplate.findMany({ where: { kind: "text" }, orderBy: [{ folder: "asc" }, { name: "asc" }], select: { id: true, name: true, folder: true } }),
  ]);
  const blocked = !isConnected("texting") ? "Texting isn't connected yet. An Admin can set it up in Admin → Integrations. Use Log text for texts sent from your own phone."
    : !enabled ? "Texting is paused (Admin → Integrations). Use Log text for texts sent from your own phone."
    : !hasPermission(user.permissions, "sendTexts") ? "You don't have permission to send texts."
    : !me?.textNumber ? "You don't have a texting number yet. An Admin can add it in Admin → Integrations."
    : unsubscribedName ? `${unsubscribedName} is tagged Unsubscribed (they replied STOP), so HQ won't text them.` : null;
  return { from: me?.textNumber ?? null, blocked, templates: templates.map((t) => ({ id: t.id, name: t.folder ? `${t.folder} · ${t.name}` : t.name })) };
}
