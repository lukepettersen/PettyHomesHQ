"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { guarded, UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { mergeFor } from "@/server/merge";
import { bulkTextPeople, sendBulkTexts } from "@/server/bulkText";
import { dailyCap } from "@/server/texting";
import { groupReady } from "@/server/groupText";
import { textingEnabled } from "@/server/integrations";
import { publicBase } from "@/server/twilio";
import { fill } from "@/lib/merge";
import { isOurImage, MAX_TEXT_PHOTOS } from "@/lib/textMedia";
import { formatPhone } from "@/lib/normalize";
import { MAX_TEXT } from "@/lib/texting";
import { BULK_TEXT_MAX, bulkDays, inBulkHours, nextBulkStart, withOptOut } from "@/lib/bulkText";
import { scheduleLabel } from "@/lib/scheduledText";

// Mass text from People (SPEC.md §6.2, owner request 2026-11-06): one text per contact from your HQ number (a couple
// as one group text), sent slowly in the background by src/server/bulkText.ts.

const ids = z.array(z.string().trim().min(1).max(40)).min(1, "Select people first.").max(BULK_TEXT_MAX, `Up to ${BULK_TEXT_MAX.toLocaleString()} people at a time.`);

/** Who will get it (and how), text templates, the daily cap and whether texting is ready. */
export async function prepareBulkText(input: { ids: string[] }) {
  return guarded("sendTexts", async (user) => {
    const v = z.object({ ids }).parse(input);
    const [{ send, skipped }, templates, me, cap, groups, on] = await Promise.all([
      bulkTextPeople(v.ids),
      db.messageTemplate.findMany({ where: { kind: "text" }, orderBy: [{ folder: "asc" }, { name: "asc" }], select: { id: true, name: true, folder: true, body: true } }),
      db.user.findUnique({ where: { id: user.id }, select: { textNumber: true } }), dailyCap(), groupReady(), textingEnabled(),
    ]);
    return {
      recipients: send.map((r) => ({ personId: r.personId, name: r.name, numbers: r.numbers.length })),
      skipped, sendsFrom: on && me?.textNumber ? formatPhone(me.textNumber) : null, cap, groups,
      days: bulkDays(send.length, cap),
      templates: templates.map((t) => ({ id: t.id, name: t.folder ? `${t.folder} · ${t.name}` : t.name, subject: "", body: t.body })),
    };
  });
}

/** The text as one person gets it (merge fields filled, opt-out line added). */
export async function previewBulkText(input: { personId: string; body: string }) {
  return guarded("sendTexts", async (user) => {
    const v = z.object({ personId: z.string().min(1).max(40), body: z.string().max(MAX_TEXT) }).parse(input);
    const { values, label } = await mergeFor(user, v.personId);
    const b = fill(v.body, values);
    return { body: withOptOut(b.text), missing: [...new Set(b.missing)].map(label) };
  });
}

const startSchema = z.object({
  personIds: ids,
  body: z.string().trim().min(1, "Write the text.").max(MAX_TEXT - 40, "That's too long for a text."),
  media: z.array(z.string().max(500)).max(MAX_TEXT_PHOTOS).default([]),
});

/** Starts a mass text. Returns its id for the progress bar and when the first one goes. */
export async function startBulkText(input: z.input<typeof startSchema>) {
  return guarded("sendTexts", async (user) => {
    const v = startSchema.parse(input);
    if (!(await textingEnabled())) throw new UserError("Texting is off. An Admin can turn it on in Admin → Integrations.");
    const me = await db.user.findUnique({ where: { id: user.id }, select: { textNumber: true } });
    if (!me?.textNumber) throw new UserError("You don't have an HQ number to send from. An Admin can add it in Admin → Integrations.");
    if (v.media.some((u) => !isOurImage(u, publicBase()))) throw new UserError("Attach photos with the 📷 button.");
    const running = await db.bulkTextJob.count({ where: { userId: user.id, state: "sending" } });
    if (running) throw new UserError("A mass text from your number is still going. Stop it or let it finish first (People → Mass texts).");
    const { send } = await bulkTextPeople(v.personIds);
    if (!send.length) throw new UserError("Nobody here can get it (no phone, or they replied STOP).");
    const nextAt = nextBulkStart();
    const job = await db.bulkTextJob.create({ data: { userId: user.id, body: v.body, media: v.media, personIds: send.map((r) => r.personId), nextAt } });
    await logActivity(user.id, "create", "text", job.id, `Started a mass text to ${send.length} ${send.length === 1 ? "contact" : "contacts"}`);
    if (inBulkHours()) void sendBulkTexts().catch(() => { /* the minute timer picks it up */ });
    revalidatePath("/people/texts");
    return { id: job.id, total: send.length, startsAt: inBulkHours() ? null : scheduleLabel(nextAt) };
  });
}

/** How a mass text is going (for the progress bar). */
export async function bulkTextStatus(id: string) {
  return guarded("sendTexts", async (user) => {
    const j = await db.bulkTextJob.findFirst({ where: { id: z.string().min(1).max(40).parse(id), userId: user.id } });
    if (!j) throw new UserError("That mass text wasn't found.");
    const total = (j.personIds as string[]).length, done = (j.doneIds as string[]).length;
    return { total, done, sent: j.sent, skipped: j.skipped, failed: j.failed as { name: string; error: string }[], state: j.state, error: j.error, nextAt: j.state === "sending" ? scheduleLabel(j.nextAt) : null };
  });
}

/** Stops a mass text; the ones already sent stay sent. */
export async function stopBulkText(id: string) {
  return guarded("sendTexts", async (user) => {
    const r = await db.bulkTextJob.updateMany({ where: { id: z.string().min(1).max(40).parse(id), userId: user.id, state: "sending" }, data: { state: "stopped", error: "Stopped." } });
    if (r.count) await logActivity(user.id, "update", "text", id, "Stopped a mass text");
    revalidatePath("/people/texts");
  });
}
