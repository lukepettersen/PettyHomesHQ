"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { guarded, UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { mergeFor } from "@/server/merge";
import { sendTextAs } from "@/server/texting";
import { fill } from "@/lib/merge";
import { formatPhone, normalizePhone } from "@/lib/normalize";
import { MAX_TEXT } from "@/lib/texting";
import { completeTask } from "../tasks/actions";

const id = z.string().trim().min(1).max(40);
const digits = z.string().trim().min(7).max(30).transform(normalizePhone);

const sendSchema = z.object({ personId: id.nullable(), to: z.string().trim().min(7).max(30), body: z.string().trim().min(1, "Write a message.").max(MAX_TEXT), taskId: z.string().trim().max(200).nullable().optional(), typed: z.boolean().optional() });

/** Send text (contact timeline, Messages, Draft text): from the user's own number. A task it came from is checked off. */
export async function sendText(input: z.input<typeof sendSchema>) {
  return guarded("sendTexts", async (user) => {
    const v = sendSchema.parse(input);
    const r = await sendTextAs(user, { personId: v.personId, to: v.to, body: v.body, typed: v.typed });
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
    const v = z.object({ ourNumber: z.string().trim().max(20), number: digits }).parse(input);
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

/** Delete a conversation from Messages (two-step in the UI). Contact timelines keep their copy. */
export async function deleteThread(input: { ourNumber: string; number: string }) {
  return guarded("sendTexts", async (user) => {
    const v = z.object({ ourNumber: z.string().trim().max(20), number: digits }).parse(input);
    const r = await db.textMessage.deleteMany({ where: { ourNumber: v.ourNumber, theirNumber: v.number } });
    await logActivity(user.id, "delete", "text", null, `Deleted the conversation with ${formatPhone(v.number)} (${r.count} messages)`);
    revalidatePath("/messages");
  });
}
