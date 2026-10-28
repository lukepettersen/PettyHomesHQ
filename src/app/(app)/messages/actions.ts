"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { guarded, UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { mergeFor } from "@/server/merge";
import { answeredBody, sendTextAs } from "@/server/texting";
import { fill } from "@/lib/merge";
import { formatPhone, normalizePhone } from "@/lib/normalize";
import { MAX_TEXT } from "@/lib/texting";
import { completeTask } from "../tasks/actions";
import { sendGroupText, startGroupText, textNumbersAsGroup } from "@/server/groupText";
import { closeConversation } from "@/server/twilio";
import { isGroupKey, MAX_GROUP } from "@/lib/groupText";
import { MAX_TEXT_PHOTOS } from "@/lib/textMedia";
import { applyReaction, reactionText, SEND_REACTIONS, type ReactionMark } from "@/lib/reactions";
import { centralToUtc, scheduleLabel, scheduleProblem } from "@/lib/scheduledText";
import { hasPermission } from "@/server/permissions";

const id = z.string().trim().min(1).max(40);
const digits = z.string().trim().min(7).max(30).transform(normalizePhone);
/** A conversation: a phone number (digits) or a group text's Conversation SID. */
const threadKey = z.string().trim().min(7).max(40).transform((s) => (isGroupKey(s) ? s : normalizePhone(s)));

const photos = z.array(z.string().trim().url().max(300)).max(MAX_TEXT_PHOTOS).optional();
const sendSchema = z.object({ personId: id.nullable(), to: z.string().trim().min(7).max(30), body: z.string().trim().max(MAX_TEXT), taskId: z.string().trim().max(200).nullable().optional(), typed: z.boolean().optional(), media: photos });

/** Send text (contact timeline, Messages, Draft text): from the user's own number. A task it came from is checked off. */
export async function sendText(input: z.input<typeof sendSchema>) {
  return guarded("sendTexts", async (user) => {
    const v = sendSchema.parse(input);
    const r = await sendTextAs(user, { personId: v.personId, to: v.to, body: v.body, typed: v.typed, media: v.media });
    if (v.taskId && v.personId) {
      const t = await db.task.findFirst({ where: { id: v.taskId, personId: v.personId, deletedAt: null, completedAt: null } });
      if (t) await completeTask(t.id);
      revalidatePath("/tasks");
    }
    return r;
  });
}

/** A text template filled in for this person. */
export async function fillTextTemplate(input: { personId: string | null; templateId: string }) {
  return guarded(null, async (user) => {
    const v = z.object({ personId: id.nullable(), templateId: id }).parse(input);
    const t = await db.messageTemplate.findFirst({ where: { id: v.templateId, kind: "text" } });
    if (!t) throw new UserError("That template was deleted.");
    const { values, label } = await mergeFor(user, v.personId);
    const body = fill(t.body, values);
    return { body: body.text, missing: body.missing.map(label) };
  });
}

/** Opening a conversation marks its texts and missed calls read. */
export async function markRead(input: { ourNumber: string; number: string }) {
  return guarded(null, async () => {
    const v = z.object({ ourNumber: z.string().trim().max(20), number: threadKey }).parse(input);
    await db.textMessage.updateMany({ where: { ourNumber: v.ourNumber, theirNumber: v.number, direction: "in", readAt: null }, data: { readAt: new Date() } });
    revalidatePath("/messages");
  });
}

/** Unknown number → an existing contact: the number is added to them and the conversation goes on their timeline. */
export async function linkNumber(input: { number: string; personId: string }) {
  return guarded(null, async (user) => {
    const v = z.object({ number: digits, personId: id }).parse(input);
    const p = await db.person.findFirst({ where: { id: v.personId, deletedAt: null }, include: { phones: true } });
    if (!p) throw new UserError("That person was deleted.");
    if (!p.phones.some((x) => x.normalized === v.number)) await db.phone.create({ data: { personId: p.id, label: "Mobile", number: formatPhone(v.number), normalized: v.number, position: p.phones.length } });
    await attach(v.number, p.id);
    await logActivity(user.id, "update", "person", p.id, `Linked ${formatPhone(v.number)} to ${p.name}`);
    revalidatePath(`/people/${p.id}`);
    return { id: p.id, name: p.name };
  });
}

/** Unknown number → a new contact with that number. */
export async function addPersonFromNumber(input: { number: string; name: string }) {
  return guarded(null, async (user) => {
    const v = z.object({ number: digits, name: z.string().trim().min(1, "Add their name.").max(160) }).parse(input);
    const p = await db.person.create({ data: { name: v.name, mailingName: v.name, createdById: user.id, assignedToId: user.id, phones: { create: [{ label: "Mobile", number: formatPhone(v.number), normalized: v.number }] } } });
    await attach(v.number, p.id);
    await logActivity(user.id, "create", "person", p.id, `Added ${v.name} from a text`);
    revalidatePath("/people");
    return { id: p.id, name: v.name };
  });
}

/** Earlier texts and missed calls from the number go onto the contact (and their timeline, in order). */
async function attach(number: string, personId: string) {
  // Answered calls from the number, each with its own timeline entry (and recording, if any).
  const calls = await db.phoneCall.findMany({ where: { theirNumber: number, personId: null } });
  const owners = new Map((await db.user.findMany({ where: { textNumber: { in: calls.map((c) => c.ourNumber) } }, select: { textNumber: true, name: true } })).map((u) => [u.textNumber, u.name]));
  for (const c of calls) {
    const entry = await db.timelineEntry.create({ data: { personId, kind: "call", outcome: "Answered", body: answeredBody(owners.get(c.ourNumber) ?? null, c.ourNumber, c.seconds), createdAt: c.createdAt } });
    await db.phoneCall.update({ where: { id: c.id }, data: { personId, entryId: entry.id } });
  }
  const loose = await db.textMessage.findMany({ where: { theirNumber: number, personId: null }, orderBy: { createdAt: "asc" } });
  if (!loose.length) return;
  await db.$transaction([
    db.textMessage.updateMany({ where: { id: { in: loose.map((m) => m.id) } }, data: { personId } }),
    ...loose.map((m) => db.timelineEntry.create({ data: m.kind === "missed_call"
      ? { personId, kind: "call", outcome: "Missed call", body: `Called the business number (${formatPhone(m.ourNumber)}).`, createdAt: m.createdAt }
      : { personId, kind: "text", outcome: m.direction === "in" ? "Received" : "Sent", body: m.body, authorId: m.sentById, createdAt: m.createdAt } })),
    db.person.update({ where: { id: personId }, data: { lastTextAt: loose.filter((m) => m.kind === "sms").at(-1)?.createdAt ?? undefined } }),
  ]);
}

/** Archive a conversation (it leaves the inbox until a new text comes in), or move it back to the inbox. Archiving marks it read. */
export async function archiveThread(input: { ourNumber: string; number: string; archived: boolean }) {
  return guarded("sendTexts", async (user) => {
    const v = z.object({ ourNumber: z.string().trim().max(20), number: threadKey, archived: z.boolean() }).parse(input);
    const key = { ourNumber: v.ourNumber, theirNumber: v.number };
    if (v.archived) {
      const now = new Date();
      await db.$transaction([
        db.textArchive.upsert({ where: { ourNumber_theirNumber: key }, create: { ...key, archivedAt: now, archivedById: user.id }, update: { archivedAt: now, archivedById: user.id } }),
        db.textMessage.updateMany({ where: { ...key, direction: "in", readAt: null }, data: { readAt: now } }),
        db.notification.updateMany({ where: { toId: user.id, readAt: null, link: `/messages?n=${v.number}` }, data: { readAt: now } }),
      ]);
    } else await db.textArchive.deleteMany({ where: key });
    await logActivity(user.id, "update", "text", null, `${v.archived ? "Archived" : "Moved to the inbox"} the conversation with ${isGroupKey(v.number) ? "a group" : formatPhone(v.number)}`);
    revalidatePath("/messages");
  });
}

/** Delete a conversation from Messages (two-step in the UI). Contact timelines keep their copy. */
export async function deleteThread(input: { ourNumber: string; number: string }) {
  return guarded("sendTexts", async (user) => {
    const v = z.object({ ourNumber: z.string().trim().max(20), number: threadKey }).parse(input);
    const r = await db.textMessage.deleteMany({ where: { ourNumber: v.ourNumber, theirNumber: v.number } });
    await db.textArchive.deleteMany({ where: { ourNumber: v.ourNumber, theirNumber: v.number } });
    // A group text is also ended in Twilio, so its people's numbers are free for other group texts.
    if (isGroupKey(v.number)) { await closeConversation(v.number); await db.textThread.deleteMany({ where: { sid: v.number } }); }
    await logActivity(user.id, "delete", "text", null, `Deleted the conversation with ${isGroupKey(v.number) ? "a group" : formatPhone(v.number)} (${r.count} messages)`);
    revalidatePath("/messages");
  });
}

/**
 * Heart, thumbs up and the other iPhone reactions on a text (owner request 2026-10-28). It goes out as a text in the
 * iPhone wording (Loved “…”), which phones that understand it show as an icon; HQ shows it as an icon on the message.
 * Clicking the same one again removes it. From your own number only.
 */
export async function reactToText(input: { messageId: string; emoji: string }) {
  return guarded("sendTexts", async (user) => {
    const v = z.object({ messageId: id, emoji: z.enum(SEND_REACTIONS.map((k) => k.emoji) as [string, ...string[]]) }).parse(input);
    const m = await db.textMessage.findUnique({ where: { id: v.messageId } });
    if (!m || m.kind !== "sms") throw new UserError("That message wasn't found.");
    const me = await db.user.findUnique({ where: { id: user.id }, select: { textNumber: true } });
    if (m.ourNumber !== me?.textNumber) throw new UserError("You can react from your own number only.");
    const by = `hq:${user.id}`;
    const marks = (Array.isArray(m.reactions) ? m.reactions : []) as ReactionMark[];
    const removed = marks.some((x) => x.by === by && x.emoji === v.emoji);
    const body = reactionText(v.emoji, m.body, removed);
    if (!body) throw new UserError("Photos without words can't get a reaction from HQ.");
    const before = new Date();
    if (isGroupKey(m.theirNumber)) await sendGroupText(user, { sid: m.theirNumber, body });
    else await sendTextAs(user, { personId: m.personId, to: m.theirNumber, body });
    await db.$transaction([
      db.textMessage.updateMany({ where: { ourNumber: m.ourNumber, theirNumber: m.theirNumber, direction: "out", sentById: user.id, body, createdAt: { gte: before } }, data: { kind: "reaction" } }),
      db.textMessage.update({ where: { id: m.id }, data: { reactions: applyReaction(marks, { emoji: v.emoji, by, removed }) } }),
    ]);
    revalidatePath("/messages");
  });
}

/** Reply in a group text (Messages). */
export async function sendGroup(input: { sid: string; body: string; media?: string[] }) {
  return guarded("sendTexts", async (user) => {
    const v = z.object({ sid: z.string().trim().refine(isGroupKey, "That isn't a group text."), body: z.string().trim().max(MAX_TEXT), media: photos }).parse(input);
    await sendGroupText(user, v);
  });
}

/** + New message → Group text: two or more contacts' numbers and the first message. */
export async function startGroup(input: { numbers: string[]; body: string }) {
  return guarded("sendTexts", async (user) => {
    const v = z.object({ numbers: z.array(digits).min(2, "Pick at least two people.").max(MAX_GROUP - 1, `Up to ${MAX_GROUP - 1} people plus you.`), body: z.string().trim().min(1, "Write a message.").max(MAX_TEXT) }).parse(input);
    return startGroupText(user, v);
  });
}

/** Send text to a contact plus others, as one group text (group texting on). A task it came from is checked off. */
export async function sendTextGroup(input: { numbers: string[]; body: string; personId?: string | null; taskId?: string | null; media?: string[] }) {
  return guarded("sendTexts", async (user) => {
    const v = z.object({ numbers: z.array(digits).min(2).max(MAX_GROUP - 1, `Up to ${MAX_GROUP - 1} people plus you.`), body: z.string().trim().max(MAX_TEXT), personId: id.nullable().optional(), taskId: z.string().trim().max(200).nullable().optional(), media: photos }).parse(input);
    const r = await textNumbersAsGroup(user, v);
    if (v.taskId && v.personId) {
      const t = await db.task.findFirst({ where: { id: v.taskId, personId: v.personId, deletedAt: null, completedAt: null } });
      if (t) await completeTask(t.id);
      revalidatePath("/tasks");
    }
    return r;
  });
}

// ---------- Scheduled texts (owner request 2026-10-28) ----------
const scheduleSchema = z.object({
  numbers: z.array(digits).min(1, "Pick at least one number.").max(MAX_GROUP - 1), body: z.string().trim().min(1, "Write a message.").max(MAX_TEXT),
  personId: id.nullable().optional(), taskId: z.string().trim().max(200).nullable().optional(), media: photos,
  date: z.string().trim().max(10), time: z.string().trim().max(5),
});

/** Schedule a text to go out later from your own number (one group text when it has two or more numbers). */
export async function scheduleText(input: z.input<typeof scheduleSchema>) {
  return guarded("sendTexts", async (user) => {
    const v = scheduleSchema.parse(input);
    const problem = scheduleProblem(v.date, v.time);
    if (problem) throw new UserError(problem);
    const me = await db.user.findUnique({ where: { id: user.id }, select: { textNumber: true } });
    if (!me?.textNumber) throw new UserError("You don't have a texting number yet. An Admin can add it in Admin → Integrations.");
    const sendAt = centralToUtc(v.date, v.time);
    const s = await db.scheduledText.create({ data: { personId: v.personId ?? null, numbers: [...new Set(v.numbers)], body: v.body, media: v.media ?? [], sendAt, taskId: v.taskId?.startsWith("date:") ? null : v.taskId ?? null, createdById: user.id } });
    await logActivity(user.id, "create", "scheduledText", v.personId ?? null, `Scheduled a text to ${s.numbers.map(formatPhone).join(", ")} for ${scheduleLabel(sendAt)}`);
    if (v.personId) revalidatePath(`/people/${v.personId}`);
    return { when: scheduleLabel(sendAt) };
  });
}

/** Cancel a scheduled text that hasn't gone out: the person who scheduled it, or anyone allowed to delete records. */
export async function cancelScheduledText(scheduledId: string) {
  return guarded("sendTexts", async (user) => {
    const s = await db.scheduledText.findUnique({ where: { id: id.parse(scheduledId) } });
    if (!s || s.status !== "pending") throw new UserError("That text already went out or was canceled.");
    if (s.createdById !== user.id && !hasPermission(user.permissions as never, "deleteRecords")) throw new UserError("Only the person who scheduled it can cancel it.");
    const r = await db.scheduledText.updateMany({ where: { id: s.id, status: "pending" }, data: { status: "canceled" } });
    if (!r.count) throw new UserError("That text is going out right now.");
    await logActivity(user.id, "delete", "scheduledText", s.personId, `Canceled the text scheduled for ${scheduleLabel(s.sendAt)}`);
    if (s.personId) revalidatePath(`/people/${s.personId}`);
  });
}
