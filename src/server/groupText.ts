import "server-only";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { isConnected, textingEnabled } from "@/server/integrations";
import { addGroupSender, closeConversation, conversationParticipants, createGroup, postGroupMessage, publicBase, setGroupAddress } from "@/server/twilio";
import { dailyCap, isUnsubscribed, lineOwner, personForNumber, recordIncoming, setUnsubscribed } from "@/server/texting";
import { formatPhone, normalizePhone } from "@/lib/normalize";
import { centralDayStart, isStartWord, isStopWord, MAX_TEXT, toE164 } from "@/lib/texting";
import { groupTitle, isGroupKey, MAX_GROUP, readParticipants } from "@/lib/groupText";

// Group texting (SPEC.md §11, owner request 2026-10-22). With it on, Twilio Conversations keeps each group text
// together and posts every message to /api/twilio/conversation. One-to-one texts that arrive this way go through
// the normal recordIncoming; sending one-to-one still uses plain Twilio texts. Message bodies are never logged.

const KEY = "texting.groups";
/** A group text and a plain copy of it arrive within seconds; this window catches the copy either way round. */
export const DUP_WINDOW = 3 * 60 * 1000;
export const conversationHook = () => `${publicBase()}/api/twilio/conversation`;

export async function groupTextingOn(): Promise<boolean> {
  const row = await db.appSetting.findUnique({ where: { key: KEY } });
  return row?.value === true;
}

const teamNumbers = async () => (await db.user.findMany({ where: { textNumber: { not: null } }, select: { textNumber: true } })).map((u) => u.textNumber!);

/** Admin switch: sets up (or removes) group texting on every team number. Off also closes HQ's Conversations. */
export async function applyGroupTexting(on: boolean): Promise<string[]> {
  const problems: string[] = [];
  for (const n of await teamNumbers()) {
    const r = await setGroupAddress(n, on, conversationHook());
    if (!r.ok) problems.push(`${formatPhone(n)}: ${r.message}`);
  }
  if (!on) for (const t of await db.textThread.findMany({ select: { sid: true } })) await closeConversation(t.sid);
  return problems;
}

/** A Conversation's line and people, read from Twilio once and remembered. */
async function threadInfo(sid: string) {
  const known = await db.textThread.findUnique({ where: { sid } });
  if (known) return known;
  const r = readParticipants(await conversationParticipants(sid), await teamNumbers());
  if (!r.ourNumber) return null;
  return db.textThread.upsert({ where: { sid }, update: {}, create: { sid, ourNumber: r.ourNumber, group: r.group, members: r.members, sender: r.sender } });
}

/** People in a group text, as contacts where we have them. */
async function membersOf(members: string[]) {
  return Promise.all(members.map(async (d) => ({ digits: d, person: await personForNumber(d) })));
}
const nameOf = (m: { digits: string; person: { name: string } | null }) => m.person?.name ?? formatPhone(m.digits);

/** Twilio's onMessageAdded webhook for a Conversation. */
export async function handleConversationMessage(f: Record<string, string>) {
  if (f.EventType && f.EventType !== "onMessageAdded") return;
  const sid = f.ConversationSid, msg = f.MessageSid, author = f.Author ?? "";
  if (!sid || !msg || !author.startsWith("+")) return; // our own messages have an "hq:" author
  if (await db.textMessage.findUnique({ where: { twilioSid: msg } })) return;
  const info = await threadInfo(sid);
  if (!info) return;
  let body = (f.Body ?? "").slice(0, 5000);
  if (f.Media && f.Media !== "[]" && f.Media !== "null") body = body ? `${body}\n[picture]` : "[picture]";
  if (!info.group) {
    await recordIncoming({ from: author, to: info.ourNumber, body, sid: msg });
    // HQ handles one-to-one texts the plain way, so close this Conversation: while it's open Twilio ties the
    // person's number to it and sends their later group texts here instead of to the group.
    await closeConversation(sid);
    await db.textThread.delete({ where: { sid } }).catch(() => null);
    return;
  }

  const from = normalizePhone(author);
  if (!info.members.includes(from)) await db.textThread.update({ where: { sid }, data: { members: [...info.members, from] } });
  const people = await membersOf([...new Set([...info.members, from])]);
  const sender = people.find((m) => m.digits === from)!;
  // The same text can also arrive as a plain one-to-one text; keep only the group copy.
  const since = new Date(Date.now() - DUP_WINDOW);
  const dupes = await db.textMessage.findMany({ where: { ourNumber: info.ourNumber, theirNumber: from, direction: "in", body, createdAt: { gte: since } }, select: { id: true, personId: true } });
  if (dupes.length) {
    await db.textMessage.deleteMany({ where: { id: { in: dupes.map((d) => d.id) } } });
    for (const d of dupes) if (d.personId) await db.timelineEntry.deleteMany({ where: { personId: d.personId, kind: "text", outcome: "Received", body, createdAt: { gte: since } } });
  }
  await db.textMessage.create({ data: { ourNumber: info.ourNumber, theirNumber: sid, fromNumber: from, personId: sender.person?.id ?? null, direction: "in", body, twilioSid: msg, status: "received" } });
  if (sender.person) {
    if (isStopWord(body)) await setUnsubscribed(sender.person.id, true);
    else if (isStartWord(body) && (await isUnsubscribed(sender.person.id))) await setUnsubscribed(sender.person.id, false);
    await db.person.update({ where: { id: sender.person.id }, data: { lastTextAt: new Date(), lastContactAt: new Date() } });
  }
  // On every contact in the group, so each timeline shows the whole conversation.
  for (const m of people) if (m.person) {
    await db.timelineEntry.create({ data: { personId: m.person.id, kind: "text", outcome: "Received", body: `Group text from ${nameOf(sender)}: ${body}` } });
    revalidatePath(`/people/${m.person.id}`);
  }
  const owner = await lineOwner(info.ourNumber);
  if (owner) await db.notification.create({ data: { toId: owner.id, personId: sender.person?.id ?? null, alert: true, link: `/messages?n=${sid}`, text: `Group text from ${nameOf(sender)}: "${body.length > 120 ? `${body.slice(0, 120)}…` : body}"` } });
}

async function checkSend(user: { id: string }, body: string) {
  if (!(await textingEnabled())) throw new UserError("Texting is off. An Admin can turn it on in Admin → Integrations.");
  if (!(await groupTextingOn())) throw new UserError("Group texting is off. An Admin can turn it on in Admin → Integrations.");
  const me = await db.user.findUnique({ where: { id: user.id }, select: { textNumber: true } });
  if (!me?.textNumber) throw new UserError("You don't have a texting number yet. An Admin can add it in Admin → Integrations.");
  const text = body.trim();
  if (!text) throw new UserError("Write a message.");
  if (text.length > MAX_TEXT) throw new UserError(`Texts can be up to ${MAX_TEXT} characters.`);
  const cap = await dailyCap();
  if ((await db.textMessage.count({ where: { ourNumber: me.textNumber, direction: "out", createdAt: { gte: centralDayStart() } } })) >= cap) throw new UserError(`You've reached today's limit of ${cap} texts from your number. It resets at midnight.`);
  return { ourNumber: me.textNumber, text };
}

/** Reply in a group text from HQ: everyone in the group gets it from the user's number. */
export async function sendGroupText(user: { id: string; name: string }, o: { sid: string; body: string }) {
  if (!isGroupKey(o.sid)) throw new UserError("That isn't a group text.");
  const { ourNumber, text } = await checkSend(user, o.body);
  const info = await threadInfo(o.sid);
  if (!info?.group) throw new UserError("That group text wasn't found.");
  if (info.ourNumber !== ourNumber) throw new UserError("This group text is on a teammate's number. Switch to your own number to text.");
  const people = await membersOf(info.members);
  for (const m of people) if (m.person && (await isUnsubscribed(m.person.id))) throw new UserError(`${m.person.name} is tagged Unsubscribed (they replied STOP), so HQ won't text this group.`);
  let author = info.sender;
  if (!author) {
    author = await addGroupSender(o.sid, ourNumber).catch((e: Error) => { throw new UserError(e.message); });
    await db.textThread.update({ where: { sid: o.sid }, data: { sender: author } });
  }
  const r = await postGroupMessage(o.sid, author, text);
  if (!r.ok) throw new UserError(r.error);
  await db.textMessage.create({ data: { ourNumber, theirNumber: o.sid, direction: "out", body: text, twilioSid: r.sid, status: r.status, sentById: user.id, readAt: new Date() } });
  for (const m of people) if (m.person) {
    await db.$transaction([
      db.timelineEntry.create({ data: { personId: m.person.id, kind: "text", outcome: "Sent", body: `Group text: ${text}`, authorId: user.id } }),
      db.person.update({ where: { id: m.person.id }, data: { lastTextAt: new Date(), lastContactAt: new Date() } }),
    ]);
    revalidatePath(`/people/${m.person.id}`);
  }
  await logActivity(user.id, "create", "text", null, `Group text to ${groupTitle(people.map(nameOf))}`);
  revalidatePath("/messages");
}

/** + New message → group: up to 9 people (saved on contacts) and the user's number, then the first text. */
export async function startGroupText(user: { id: string; name: string }, o: { numbers: string[]; body: string }) {
  const { ourNumber } = await checkSend(user, o.body);
  const digits = [...new Set(o.numbers.map(normalizePhone))];
  if (digits.length < 2) throw new UserError("Pick at least two people for a group text.");
  if (digits.length > MAX_GROUP - 1) throw new UserError(`A group text can have up to ${MAX_GROUP - 1} people plus you.`);
  const people = await membersOf(digits);
  for (const m of people) {
    if (!toE164(m.digits)) throw new UserError(`${formatPhone(m.digits)} isn't a US phone number.`);
    if (!m.person) throw new UserError(`HQ only texts saved contacts. Add ${formatPhone(m.digits)} to a contact first.`);
    if (await isUnsubscribed(m.person.id)) throw new UserError(`${m.person.name} is tagged Unsubscribed, so HQ won't text them.`);
  }
  const sid = await createGroup({ ourNumber, numbers: digits.map((d) => toE164(d)!), name: groupTitle(people.map(nameOf)), webhookUrl: conversationHook() })
    .catch((e: Error) => { throw new UserError(e.message); });
  await db.textThread.create({ data: { sid, ourNumber, group: true, members: digits, sender: `hq:${ourNumber}` } });
  await sendGroupText(user, { sid, body: o.body });
  return { sid };
}

export const groupReady = async () => isConnected("texting") && (await groupTextingOn());
