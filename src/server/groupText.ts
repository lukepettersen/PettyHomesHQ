import "server-only";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { isConnected, textingEnabled } from "@/server/integrations";
import { addGroupSender, closeConversation, conversationParticipants, createGroup, postGroupMessage, publicBase, setGroupAddress, uploadGroupPhoto } from "@/server/twilio";
import { COPY_WINDOW, dailyCap, hasTextStop, lineOwner, personForNumber, recordIncoming, recordReaction, saveOnce, setTextStop } from "@/server/texting";
import { formatPhone, normalizePhone } from "@/lib/normalize";
import { centralDayStart, isStartWord, isStopWord, MAX_TEXT, toE164 } from "@/lib/texting";
import { groupMembers, groupTitle, isGroupKey, MAX_GROUP, otherRecipients, readParticipants } from "@/lib/groupText";
import { conversationMedia, isOurImage, MAX_TEXT_PHOTOS, plainMedia, textWithPhotos, type TextMedia } from "@/lib/textMedia";
import { EMAIL_IMAGE_PREFIX } from "@/lib/emailImages";
import { getFile } from "@/server/storage";
import { noteInbound } from "@/server/textDebug";

// Group texting (SPEC.md §11, owner request 2026-10-22). A group text that includes a team number arrives on the
// plain text webhook with its other people listed (OtherRecipients0…); HQ keeps those as one group thread. Replies
// (and new groups) go out through a Twilio Conversation made for that group, whose messages post to
// /api/twilio/conversation. One-to-one texts stay plain. Message bodies are never logged.

const KEY = "texting.groups";
export const conversationHook = () => `${publicBase()}/api/twilio/conversation`;

export async function groupTextingOn(): Promise<boolean> {
  const row = await db.appSetting.findUnique({ where: { key: KEY } });
  return row?.value === true;
}

const teamNumbers = async () => (await db.user.findMany({ where: { textNumber: { not: null } }, select: { textNumber: true } })).map((u) => u.textNumber!);

/**
 * Admin switch. Either way it removes Twilio's Conversations auto-setup on the team numbers (it delivered every
 * text twice and isn't needed: group texts come in on the plain webhook). Off also closes HQ's Conversations.
 */
export async function applyGroupTexting(on: boolean): Promise<string[]> {
  const problems: string[] = [];
  for (const n of await teamNumbers()) {
    const r = await setGroupAddress(n, false, conversationHook());
    if (!r.ok) problems.push(`${formatPhone(n)}: ${r.message}`);
  }
  if (!on) {
    for (const t of await db.textThread.findMany({ where: { conversationSid: { not: null } }, select: { conversationSid: true } })) await closeConversation(t.conversationSid!);
    // A closed Conversation can't send; the next reply makes a fresh one.
    await db.textThread.updateMany({ data: { conversationSid: null, sender: null } });
  }
  return problems;
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
/** The group thread on a line with exactly these people, if there is one. */
async function groupWith(ourNumber: string, members: string[]) {
  return (await db.textThread.findMany({ where: { ourNumber, group: true }, orderBy: { createdAt: "asc" } })).find((t) => sameSet(t.members, members)) ?? null;
}

/** A Conversation's group thread: known already, the same people's thread (linked to it now), or a new one. */
async function threadForConversation(sid: string) {
  const known = await db.textThread.findFirst({ where: { OR: [{ conversationSid: sid }, { sid }] } });
  if (known) return known;
  const r = readParticipants(await conversationParticipants(sid), await teamNumbers());
  if (!r.ourNumber) return null;
  if (r.group) {
    const same = await groupWith(r.ourNumber, r.members);
    if (same) return db.textThread.update({ where: { sid: same.sid }, data: { conversationSid: sid, sender: same.sender ?? r.sender } });
  }
  return db.textThread.upsert({ where: { sid }, update: {}, create: { sid, conversationSid: sid, ourNumber: r.ourNumber, group: r.group, members: r.members, sender: r.sender } });
}

/** People in a group text, as contacts where we have them. */
async function membersOf(members: string[]) {
  return Promise.all(members.map(async (d) => ({ digits: d, person: await personForNumber(d) })));
}
/** One entry per contact: a couple's two numbers are one contact. */
const uniqueContacts = <T extends { person: { id: string } | null }>(people: T[]) => people.filter((m, i) => !m.person || people.findIndex((x) => x.person?.id === m.person!.id) === i);
const nameOf = (m: { digits: string; person: { name: string } | null }) => m.person?.name ?? formatPhone(m.digits);

type Thread = { sid: string; ourNumber: string; members: string[] };
/**
 * Saves one incoming group message (from either webhook) on its thread: once, even if Twilio delivers it twice;
 * on every contact's timeline in the group; with an alert for the line's owner.
 */
async function recordGroupMessage(t: Thread, o: { from: string; body: string; sid: string; media?: TextMedia[] }) {
  const from = normalizePhone(o.from);
  const media = o.media ?? [];
  if (!media.length && (await recordReaction({ ourNumber: t.ourNumber, thread: t.sid, by: from, body: o.body }))) return;
  o = { ...o, body: textWithPhotos(o.body, media) };
  const members = t.members.includes(from) ? t.members : [...t.members, from];
  if (members !== t.members) await db.textThread.update({ where: { sid: t.sid }, data: { members } });
  const people = await membersOf(members);
  const sender = people.find((m) => m.digits === from)!;
  const since = new Date(Date.now() - COPY_WINDOW);
  const saved = await saveOnce(t.ourNumber, from, async (tx) => {
    if (await tx.textMessage.findUnique({ where: { twilioSid: o.sid } })) return false;
    // Already saved through the other webhook (plain SM… vs Conversation IM…).
    const other = o.sid.startsWith("IM") ? "SM" : "IM";
    if (await tx.textMessage.findFirst({ where: { ourNumber: t.ourNumber, fromNumber: from, direction: "in", body: o.body, createdAt: { gte: since }, twilioSid: { startsWith: other } } })) return false;
    // A plain one-to-one copy saved first: drop it (and its timeline line and alert).
    const dupes = await tx.textMessage.findMany({ where: { ourNumber: t.ourNumber, theirNumber: from, direction: "in", body: o.body, createdAt: { gte: since } }, select: { id: true, personId: true } });
    if (dupes.length) {
      await tx.textMessage.deleteMany({ where: { id: { in: dupes.map((d) => d.id) } } });
      for (const d of dupes) if (d.personId) await tx.timelineEntry.deleteMany({ where: { personId: d.personId, kind: "text", outcome: "Received", body: o.body, createdAt: { gte: since } } });
      await tx.notification.deleteMany({ where: { createdAt: { gte: since }, text: { startsWith: "Text from " }, link: `/messages?n=${from}` } });
    }
    await tx.textMessage.create({ data: { ourNumber: t.ourNumber, theirNumber: t.sid, fromNumber: from, personId: sender.person?.id ?? null, direction: "in", body: o.body, media, twilioSid: o.sid, status: "received" } });
    return true;
  });
  if (!saved) return;
  if (sender.person) {
    if (isStopWord(o.body)) await setTextStop(sender.person.id, true);
    else if (isStartWord(o.body) && (await hasTextStop(sender.person.id))) await setTextStop(sender.person.id, false);
    await db.person.update({ where: { id: sender.person.id }, data: { lastTextAt: new Date(), lastContactAt: new Date() } });
  }
  // On every contact in the group (once each, even with two numbers in it), so each timeline shows the whole conversation.
  for (const m of uniqueContacts(people)) if (m.person) {
    await db.timelineEntry.create({ data: { personId: m.person.id, kind: "text", outcome: "Received", body: `Group text from ${nameOf(sender)}: ${o.body}` } });
    revalidatePath(`/people/${m.person.id}`);
  }
  const owner = await lineOwner(t.ourNumber);
  if (owner) await db.notification.create({ data: { toId: owner.id, personId: sender.person?.id ?? null, alert: true, link: `/messages?n=${t.sid}`, text: `Group text from ${nameOf(sender)}: "${o.body.length > 120 ? `${o.body.slice(0, 120)}…` : o.body}"` } });
  revalidatePath("/messages");
}

/** Plain text webhook with OtherRecipients: a group text. Returns false when it should be saved as one-to-one. */
export async function recordPlainGroup(f: Record<string, string>): Promise<boolean> {
  const others = otherRecipients(f);
  if (!others.length || !f.From || !f.To || !f.MessageSid || !(await groupTextingOn())) return false;
  const members = groupMembers(f.From, others, f.To);
  if (members.length < 2) return false;
  const thread = (await groupWith(f.To, members))
    ?? (await db.textThread.create({ data: { sid: `G${createHash("sha256").update(`${f.To}|${members.join(",")}`).digest("hex").slice(0, 32)}`, ourNumber: f.To, group: true, members } }));
  await recordGroupMessage(thread, { from: f.From, body: (f.Body ?? "").slice(0, 5000), sid: f.MessageSid, media: plainMedia(f) });
  return true;
}

/** Twilio's onMessageAdded webhook for a Conversation (group texts HQ sends through, and any older ones). */
export async function handleConversationMessage(f: Record<string, string>) {
  if (f.EventType && f.EventType !== "onMessageAdded") return;
  const sid = f.ConversationSid, msg = f.MessageSid, author = f.Author ?? "";
  if (!sid || !msg || !author.startsWith("+")) return; // our own messages have an "hq:" author
  if (await db.textMessage.findUnique({ where: { twilioSid: msg } })) return;
  const info = await threadForConversation(sid);
  await noteInbound({ via: "conversation", from: author, to: info?.ourNumber ?? "", group: info?.group, people: info ? info.members.length : undefined, media: f.Media && f.Media !== "[]" ? 1 : 0 });
  if (!info) return;
  const body = (f.Body ?? "").slice(0, 5000), media = conversationMedia(f);
  if (!info.group) {
    await recordIncoming({ from: author, to: info.ourNumber, body, sid: msg, media });
    // HQ handles one-to-one texts the plain way, so close this Conversation: while it's open Twilio ties the
    // person's number to it and sends their later group texts here instead of to the group.
    await closeConversation(sid);
    await db.textThread.delete({ where: { sid: info.sid } }).catch(() => null);
    return;
  }
  await recordGroupMessage(info, { from: author, body, sid: msg, media });
}

async function checkSend(user: { id: string }, body: string, photos = 0) {
  if (!(await textingEnabled())) throw new UserError("Texting is off. An Admin can turn it on in Admin → Integrations.");
  if (!(await groupTextingOn())) throw new UserError("Group texting is off. An Admin can turn it on in Admin → Integrations.");
  const me = await db.user.findUnique({ where: { id: user.id }, select: { textNumber: true } });
  if (!me?.textNumber) throw new UserError("You don't have a texting number yet. An Admin can add it in Admin → Integrations.");
  const text = body.trim();
  if (!text && !photos) throw new UserError("Write a message.");
  if (text.length > MAX_TEXT) throw new UserError(`Texts can be up to ${MAX_TEXT} characters.`);
  const cap = await dailyCap();
  if ((await db.textMessage.count({ where: { ourNumber: me.textNumber, direction: "out", createdAt: { gte: centralDayStart() } } })) >= cap) throw new UserError(`You've reached today's limit of ${cap} texts from your number. It resets at midnight.`);
  return { ourNumber: me.textNumber, text };
}

/**
 * Reply in a group text from HQ: everyone in the group gets it from the user's number, through the group's Twilio
 * Conversation (made the first time HQ replies to a group that texted in).
 */
export async function sendGroupText(user: { id: string; name: string }, o: { sid: string; body: string; media?: string[] }) {
  if (!isGroupKey(o.sid)) throw new UserError("That isn't a group text.");
  const photos = o.media ?? [];
  if (photos.length > MAX_TEXT_PHOTOS) throw new UserError(`Up to ${MAX_TEXT_PHOTOS} photos in one text.`);
  if (photos.some((u) => !isOurImage(u, publicBase()))) throw new UserError("Attach photos with the 📷 button.");
  const { ourNumber, text } = await checkSend(user, o.body, photos.length);
  const info = await db.textThread.findUnique({ where: { sid: o.sid } });
  if (!info?.group) throw new UserError("That group text wasn't found.");
  if (info.ourNumber !== ourNumber) throw new UserError("This group text is on a teammate's number. Switch to your own number to text.");
  const people = await membersOf(info.members);
  for (const m of people) if (m.person && (await hasTextStop(m.person.id))) throw new UserError(`${m.person.name} replied STOP to your texts, so HQ won't text this group.`);
  if (info.members.length > MAX_GROUP - 1) throw new UserError(`HQ can reply to groups of up to ${MAX_GROUP} people (Twilio's limit). Reply from your phone for this one.`);
  let conv = info.conversationSid, author = info.sender;
  if (!conv) {
    conv = await createGroup({ ourNumber, numbers: info.members.map((d) => toE164(d) ?? `+${d}`), name: groupTitle([...new Set(people.map(nameOf))]), webhookUrl: conversationHook() })
      .catch((e: Error) => { throw new UserError(e.message); });
    author = `hq:${ourNumber}`;
    await db.textThread.update({ where: { sid: o.sid }, data: { conversationSid: conv, sender: author } });
  }
  if (!author) {
    author = await addGroupSender(conv, ourNumber).catch((e: Error) => { throw new UserError(e.message); });
    await db.textThread.update({ where: { sid: o.sid }, data: { sender: author } });
  }
  // A group message carries one photo, so the words go with the first and each other photo is its own message.
  const parts: { body: string; photo?: string }[] = photos.length ? photos.map((p, i) => ({ body: i === 0 ? text : "", photo: p })) : [{ body: text }];
  for (const part of parts) {
    let mediaSid: string | undefined;
    if (part.photo) {
      const name = part.photo.split("/").pop()!;
      const bytes = await getFile(`${EMAIL_IMAGE_PREFIX}${name}`).catch(() => null);
      if (!bytes) throw new UserError("That photo couldn't be read from file storage. Attach it again.");
      const type = name.endsWith(".png") ? "image/png" : name.endsWith(".gif") ? "image/gif" : "image/jpeg";
      mediaSid = await uploadGroupPhoto(conv, bytes, type, name).catch((e: Error) => { throw new UserError(e.message); });
    }
    const r = await postGroupMessage(conv, author, part.body, mediaSid);
    if (!r.ok) throw new UserError(r.error);
    await db.textMessage.create({ data: { ourNumber, theirNumber: o.sid, direction: "out", body: textWithPhotos(part.body, part.photo ? [part.photo] : []), media: part.photo ? [{ url: part.photo, type: "image" }] : [], twilioSid: r.sid, status: r.status, sentById: user.id, readAt: new Date() } });
  }
  for (const m of uniqueContacts(people)) if (m.person) {
    await db.$transaction([
      db.timelineEntry.create({ data: { personId: m.person.id, kind: "text", outcome: "Sent", body: `Group text: ${[text, photos.length ? "📷 Photo" : ""].filter(Boolean).join("\n")}`, authorId: user.id } }),
      db.person.update({ where: { id: m.person.id }, data: { lastTextAt: new Date(), lastContactAt: new Date() } }),
    ]);
    revalidatePath(`/people/${m.person.id}`);
  }
  await logActivity(user.id, "create", "text", null, `Group text to ${groupTitle([...new Set(people.map(nameOf))])}`);
  revalidatePath("/messages");
}

/** + New message → group: up to 9 people (saved on contacts) and the user's number, then the first text. */
export async function startGroupText(user: { id: string; name: string }, o: { numbers: string[]; body: string; media?: string[] }) {
  const { ourNumber } = await checkSend(user, o.body, o.media?.length ?? 0);
  const digits = [...new Set(o.numbers.map(normalizePhone))];
  if (digits.length < 2) throw new UserError("Pick at least two people for a group text.");
  if (digits.length > MAX_GROUP - 1) throw new UserError(`A group text can have up to ${MAX_GROUP - 1} people plus you.`);
  const people = await membersOf(digits);
  const teamCells = (await db.user.findMany({ where: { forwardTo: { not: null } }, select: { forwardTo: true } })).map((u) => normalizePhone(u.forwardTo!));
  for (const m of people) {
    if (!toE164(m.digits)) throw new UserError(`${formatPhone(m.digits)} isn't a US phone number.`);
    if (!m.person && !teamCells.includes(m.digits)) throw new UserError(`HQ only texts saved contacts. Add ${formatPhone(m.digits)} to a contact first.`);
    if (m.person && (await hasTextStop(m.person.id))) throw new UserError(`${m.person.name} replied STOP to your texts, so HQ won't text them.`);
  }
  const sid = await createGroup({ ourNumber, numbers: digits.map((d) => toE164(d)!), name: groupTitle([...new Set(people.map(nameOf))]), webhookUrl: conversationHook() })
    .catch((e: Error) => { throw new UserError(e.message); });
  await db.textThread.create({ data: { sid, conversationSid: sid, ourNumber, group: true, members: digits, sender: `hq:${ourNumber}` } });
  await sendGroupText(user, { sid, body: o.body, media: o.media });
  return { sid };
}

/** Send text with more than one number (group texting on): one group text, the same thread as before if these people already have one. */
export async function textNumbersAsGroup(user: { id: string; name: string }, o: { numbers: string[]; body: string; media?: string[] }) {
  const me = await db.user.findUnique({ where: { id: user.id }, select: { textNumber: true } });
  const want = [...new Set(o.numbers.map(normalizePhone))].sort();
  const same = me?.textNumber ? await groupWith(me.textNumber, want) : null;
  if (same) { await sendGroupText(user, { sid: same.sid, body: o.body, media: o.media }); return { sid: same.sid }; }
  return startGroupText(user, { numbers: want, body: o.body, media: o.media });
}

export const groupReady = async () => isConnected("texting") && (await groupTextingOn());
