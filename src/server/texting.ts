import "server-only";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { isConnected, textingEnabled } from "@/server/integrations";
import { hasPermission } from "@/server/permissions";
import type { SessionUser } from "@/server/auth";
import { publicBase, sendSms } from "@/server/twilio";
import { runTextCommand } from "@/server/textCommands";
import { formatPhone, normalizePhone } from "@/lib/normalize";
import { groupTitle, isGroupKey } from "@/lib/groupText";
import { applyReaction, parseReaction, reactsTo, type ReactionMark } from "@/lib/reactions";
import { isOurImage, MAX_TEXT_PHOTOS, textWithPhotos, type TextMedia } from "@/lib/textMedia";
import { callLength, centralDayStart, DEFAULT_DAILY_CAP, otherRoute, TEXT_STOP_TAG, isStartWord, isStopWord, MAX_TEXT, toE164 } from "@/lib/texting";

// Business texting (SPEC.md §11). Each team member has their own Twilio number (owner, 2026-10-20). Texts and
// missed calls are TextMessage rows; texts with a known contact also go on their timeline and count as a touch.
// Message bodies are never written to logs.

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

export const lineOwner = (ourNumber: string) => db.user.findFirst({ where: { textNumber: ourNumber, status: { not: "DISABLED" } }, select: { id: true, name: true, forwardTo: true } });

export async function setTextStop(personId: string, on: boolean) {
  const tag = await db.tag.upsert({ where: { name: TEXT_STOP_TAG }, create: { name: TEXT_STOP_TAG }, update: {} });
  if (on) await db.personTag.upsert({ where: { personId_tagId: { personId, tagId: tag.id } }, create: { personId, tagId: tag.id }, update: {} });
  else await db.personTag.deleteMany({ where: { personId, tagId: tag.id } });
}
export async function hasTextStop(personId: string) {
  return (await db.personTag.count({ where: { personId, tag: { name: TEXT_STOP_TAG } } })) > 0;
}

/** How far apart two deliveries of the same text can arrive. */
export const COPY_WINDOW = 3 * 60 * 1000;
type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
/**
 * Runs a check-then-save for one line and person at a time (a database lock), so two copies of a text arriving
 * at the same moment can't both be saved.
 */
export async function saveOnce<T>(ourNumber: string, theirs: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`text:${ourNumber}:${theirs}`}))`;
    return fn(tx);
  });
}

/**
 * An iPhone reaction (Loved “…”) becomes an icon on the message it quotes, in the same thread, instead of a new
 * text. Returns false when it isn't one or the message isn't found (then it's saved as a normal text).
 */
export async function recordReaction(o: { ourNumber: string; thread: string; by: string; body: string }): Promise<boolean> {
  const r = parseReaction(o.body);
  if (!r) return false;
  const recent = await db.textMessage.findMany({ where: { ourNumber: o.ourNumber, theirNumber: o.thread, kind: "sms" }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, body: true, reactions: true } });
  const hit = recent.find((m) => reactsTo(r.target, m.body));
  if (!hit) return false;
  // Applying the same reaction twice changes nothing, so a text Twilio delivers twice is fine.
  const reactions = applyReaction((Array.isArray(hit.reactions) ? hit.reactions : []) as ReactionMark[], { emoji: r.emoji, by: o.by, removed: r.removed });
  await db.textMessage.update({ where: { id: hit.id }, data: { reactions } });
  revalidatePath("/messages");
  return true;
}

/** A text that came in (from Twilio's webhook). STOP tags them Text Unsubscribed (blocks texts); START/YES removes it. */
export async function recordIncoming(o: { from: string; to: string; body: string; sid: string; media?: TextMedia[] }) {
  const theirs = normalizePhone(o.from);
  const media = o.media ?? [];
  if (!media.length && (await recordReaction({ ourNumber: o.to, thread: theirs, by: theirs, body: o.body }))) return;
  const [owner, person] = await Promise.all([lineOwner(o.to), personForNumber(theirs)]);
  const body = textWithPhotos(o.body.slice(0, 5000), media);
  const saved = await saveOnce(o.to, theirs, async (tx) => {
    if (await tx.textMessage.findUnique({ where: { twilioSid: o.sid } })) return false; // Twilio retried
    const since = new Date(Date.now() - COPY_WINDOW);
    // With group texting on, Twilio can deliver one text twice: plainly (SM…) and through Conversations (IM…),
    // or as part of a group text. Keep the first copy only.
    if (await tx.textMessage.findFirst({ where: { ourNumber: o.to, direction: "in", body, createdAt: { gte: since }, OR: [{ fromNumber: theirs }, { theirNumber: theirs, twilioSid: otherRoute(o.sid) }] } })) return false;
    await tx.textMessage.create({ data: { ourNumber: o.to, theirNumber: theirs, personId: person?.id ?? null, direction: "in", body, media, twilioSid: o.sid, status: "received" } });
    return true;
  });
  if (!saved) return;
  // "task …" from your own cell to your own HQ number: done and answered, no alert or timeline line.
  if (!media.length && (await runTextCommand({ from: theirs, to: o.to, body }))) {
    await db.textMessage.updateMany({ where: { twilioSid: o.sid }, data: { readAt: new Date() } });
    return;
  }
  if (person) {
    let extra = "";
    if (isStopWord(body)) { await setTextStop(person.id, true); extra = " They replied STOP: tagged Text Unsubscribed, and texts to them are blocked."; }
    else if (isStartWord(body) && (await hasTextStop(person.id))) { await setTextStop(person.id, false); extra = " They opted back in: Text Unsubscribed tag removed."; }
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

/** An answered (forwarded) call: its length goes on the contact's timeline and counts as contact. */
export async function recordAnsweredCall(o: { from: string; to: string; sid: string; seconds: number; recordingSid?: string | null }) {
  const theirs = normalizePhone(o.from);
  const [owner, person] = await Promise.all([lineOwner(o.to), personForNumber(theirs)]);
  const data = { ourNumber: o.to, theirNumber: theirs, personId: person?.id ?? null, seconds: Math.max(0, Math.round(o.seconds) || 0), ...(o.recordingSid ? { recordingSid: o.recordingSid } : {}) };
  const call = await db.phoneCall.upsert({ where: { callSid: o.sid }, create: { callSid: o.sid, ...data }, update: data });
  if (!person || call.entryId) return;
  const entry = await db.timelineEntry.create({ data: { personId: person.id, kind: "call", outcome: "Answered", body: answeredBody(owner?.name ?? null, o.to, call.seconds), createdAt: call.createdAt } });
  await db.$transaction([
    db.phoneCall.update({ where: { id: call.id }, data: { entryId: entry.id } }),
    db.person.update({ where: { id: person.id }, data: { lastContactAt: new Date() } }),
  ]);
  revalidatePath(`/people/${person.id}`);
}
export const answeredBody = (ownerName: string | null, ourNumber: string, seconds: number) =>
  `Called ${ownerName ? `${ownerName.split(" ")[0]}'s` : "the"} business number (${formatPhone(ourNumber)}) · ${callLength(seconds)}`;

/** A call placed from HQ in the browser (owner request 2026-10-27): logged on the contact's timeline. */
export async function recordOutboundCall(o: { userId: string; to: string; sid: string; seconds: number; answered: boolean; recordingSid?: string | null }) {
  const user = await db.user.findUnique({ where: { id: o.userId }, select: { name: true, textNumber: true } });
  if (!user?.textNumber) return;
  const theirs = normalizePhone(o.to);
  const person = await personForNumber(theirs);
  const data = { ourNumber: user.textNumber, theirNumber: theirs, personId: person?.id ?? null, seconds: o.answered ? Math.max(0, Math.round(o.seconds) || 0) : 0, ...(o.recordingSid ? { recordingSid: o.recordingSid } : {}) };
  const call = await db.phoneCall.upsert({ where: { callSid: o.sid }, create: { callSid: o.sid, ...data }, update: data });
  if (!person || call.entryId) return;
  const body = `${user.name.split(" ")[0]} called from HQ (${formatPhone(user.textNumber)})${o.answered ? ` · ${callLength(call.seconds)}` : ""}`;
  const entry = await db.timelineEntry.create({ data: { personId: person.id, kind: "call", outcome: o.answered ? "Answered" : "No answer", body, authorId: o.userId, createdAt: call.createdAt } });
  await db.$transaction([
    db.phoneCall.update({ where: { id: call.id }, data: { entryId: entry.id } }),
    ...(o.answered ? [db.person.update({ where: { id: person.id }, data: { lastContactAt: new Date() } })] : []),
  ]);
  revalidatePath(`/people/${person.id}`);
}

/** Twilio finished a call's recording (may arrive before or after the call itself is logged). */
export async function recordRecording(o: { callSid: string; recordingSid: string; seconds: number }) {
  const data = { recordingSid: o.recordingSid, recordingSeconds: Math.max(0, Math.round(o.seconds) || 0) };
  const call = await db.phoneCall.upsert({ where: { callSid: o.callSid }, create: { callSid: o.callSid, ...data }, update: data });
  if (call.personId) revalidatePath(`/people/${call.personId}`);
}

export async function updateStatus(sid: string, status: string, errorCode?: string | null) {
  await db.textMessage.updateMany({ where: { twilioSid: sid }, data: { status: status.slice(0, 20), ...(errorCode ? { error: errorCode.slice(0, 10) } : {}) } });
}

/**
 * Sends a text from the user's own number, typed by them (so quiet hours don't apply; they hold only automatic
 * texts). To a phone saved on the contact, or back to a number that texted this line. Never to someone who replied STOP.
 */
export async function sendTextAs(user: { id: string; name: string }, o: { personId: string | null; to: string; body: string; typed?: boolean; media?: string[] }) {
  if (!(await textingEnabled())) throw new UserError("Texting is off. An Admin can turn it on in Admin → Integrations.");
  const me = await db.user.findUnique({ where: { id: user.id }, select: { textNumber: true } });
  if (!me?.textNumber) throw new UserError("You don't have a texting number yet. An Admin can add it in Admin → Integrations.");
  const photos = o.media ?? [];
  if (photos.length > MAX_TEXT_PHOTOS) throw new UserError(`Up to ${MAX_TEXT_PHOTOS} photos in one text.`);
  if (photos.some((u) => !isOurImage(u, publicBase()))) throw new UserError("Attach photos with the 📷 button.");
  const body = o.body.trim();
  if (!body && !photos.length) throw new UserError("Write a message.");
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
  if (person && (await hasTextStop(person.id))) throw new UserError(`${person.name} replied STOP to your texts, so HQ won't text them (they can text START to opt back in).`);
  const cap = await dailyCap();
  const sentToday = await db.textMessage.count({ where: { ourNumber: me.textNumber, direction: "out", createdAt: { gte: centralDayStart() } } });
  if (sentToday >= cap) throw new UserError(`You've reached today's limit of ${cap} texts from your number. It resets at midnight (Admin → Integrations to change it).`);

  const r = await sendSms({ from: me.textNumber, to, body, media: photos });
  if (!r.ok) throw new UserError(r.error);
  const saved = textWithPhotos(body, photos);
  await db.textMessage.create({ data: { ourNumber: me.textNumber, theirNumber: theirs, personId: person?.id ?? null, direction: "out", body: saved, media: photos.map((url) => ({ url, type: "image" })), twilioSid: r.sid, status: r.status, sentById: user.id, readAt: new Date() } });
  if (person) {
    await db.$transaction([
      db.timelineEntry.create({ data: { personId: person.id, kind: "text", outcome: "Sent", body: body && photos.length ? `${body}\n📷 Photo` : saved, authorId: user.id } }),
      db.person.update({ where: { id: person.id }, data: { lastTextAt: new Date(), lastContactAt: new Date() } }),
    ]);
    revalidatePath(`/people/${person.id}`);
  }
  await logActivity(user.id, "create", "text", person?.id ?? null, `Texted ${person?.name ?? formatPhone(theirs)}`);
  revalidatePath("/messages");
  return { name: person?.name ?? formatPhone(theirs) };
}

// ---------- Messages page ----------
export type Thread = { number: string; personId: string | null; name: string; last: string; lastKind: string; lastDir: string; at: string; unread: number; group?: boolean };
export type Bubble = { id: string; direction: string; kind: string; body: string; status: string; error: string | null; by: string | null; at: string; from?: string | null; reactions?: string[]; photos?: string[] };
export type GroupInfo = { title: string; members: { name: string; personId: string | null; digits: string }[] };

/** Group texts' names (the people in them, as contacts where we have them). */
export async function groupNames(sids: string[]): Promise<Map<string, GroupInfo>> {
  const out = new Map<string, GroupInfo>();
  for (const t of await db.textThread.findMany({ where: { sid: { in: sids } } })) {
    const members = await Promise.all(t.members.map(async (d) => { const p = await personForNumber(d); return { name: p?.name ?? formatPhone(d), personId: p?.id ?? null, digits: d }; }));
    // A contact with two numbers in the group shows once.
    const shown = members.filter((m, i) => !m.personId || members.findIndex((x) => x.personId === m.personId) === i);
    out.set(t.sid, { title: groupTitle(shown.map((m) => m.name)), members: shown });
  }
  return out;
}

export async function loadThreads(ourNumber: string): Promise<Thread[]> {
  const latest = await db.textMessage.findMany({ where: { ourNumber }, orderBy: { createdAt: "desc" }, distinct: ["theirNumber"], take: 300, include: { person: { select: { id: true, name: true, deletedAt: true } } } });
  const unread = await db.textMessage.groupBy({ by: ["theirNumber"], where: { ourNumber, direction: "in", readAt: null }, _count: true });
  const unreadBy = new Map(unread.map((u) => [u.theirNumber, u._count]));
  const people = new Map<string, { id: string; name: string } | null>();
  const groups = await groupNames(latest.filter((m) => isGroupKey(m.theirNumber)).map((m) => m.theirNumber));
  for (const m of latest) if (!isGroupKey(m.theirNumber) && (!m.person || m.person.deletedAt)) people.set(m.theirNumber, await personForNumber(m.theirNumber));
  return latest.map((m) => {
    const base = { number: m.theirNumber, last: m.kind === "missed_call" ? "Missed call" : m.body, lastKind: m.kind, lastDir: m.direction, at: m.createdAt.toISOString(), unread: unreadBy.get(m.theirNumber) ?? 0 };
    if (isGroupKey(m.theirNumber)) return { ...base, personId: null, name: groups.get(m.theirNumber)?.title ?? "Group text", group: true };
    const p = m.person && !m.person.deletedAt ? m.person : people.get(m.theirNumber) ?? null;
    return { ...base, personId: p?.id ?? null, name: p?.name ?? formatPhone(m.theirNumber) };
  });
}

export async function loadConversation(ourNumber: string, theirNumber: string): Promise<Bubble[]> {
  const rows = await db.textMessage.findMany({ where: { ourNumber, theirNumber }, orderBy: { createdAt: "asc" }, take: 500, include: { sentBy: { select: { name: true } }, person: { select: { name: true } } } });
  return rows.map((m) => ({ id: m.id, direction: m.direction, kind: m.kind, body: m.body, status: m.status, error: m.error, by: m.sentBy?.name.split(" ")[0] ?? null, at: m.createdAt.toISOString(),
    from: m.fromNumber ? m.person?.name ?? formatPhone(m.fromNumber) : null, reactions: ((Array.isArray(m.reactions) ? m.reactions : []) as ReactionMark[]).map((x) => x.emoji),
    photos: (Array.isArray(m.media) ? m.media : []).map((_, i) => `/api/texts/${m.id}/photo/${i}`) }));
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
    : unsubscribedName ? `${unsubscribedName} replied STOP to your texts, so HQ won't text them (they can text START to opt back in).` : null;
  // Group texting on: Send text also goes to the owner's cell (Luke's, so he's on every client thread; owner 2026-10-22).
  const groups = (await db.appSetting.findUnique({ where: { key: "texting.groups" } }))?.value === true;
  const owner = groups ? await db.user.findFirst({ where: { isOwner: true, forwardTo: { not: null } }, select: { id: true, name: true, forwardTo: true } }) : null;
  const ownerCell = owner?.forwardTo ? { value: normalizePhone(owner.forwardTo), label: owner.id === user.id ? `Your cell · ${formatPhone(owner.forwardTo)}` : `${owner.name.split(" ")[0]}'s cell · ${formatPhone(owner.forwardTo)}`, personId: (await personForNumber(normalizePhone(owner.forwardTo)))?.id ?? null } : null;
  return { from: me?.textNumber ?? null, blocked, groupsOn: groups, ownerCell, templates: templates.map((t) => ({ id: t.id, name: t.folder ? `${t.folder} · ${t.name}` : t.name })) };
}
