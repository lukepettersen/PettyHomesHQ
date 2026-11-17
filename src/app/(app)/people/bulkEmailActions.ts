"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { guarded, UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { mergeFor } from "@/server/merge";
import { sendBulkJobs, bulkPeople } from "@/server/bulkEmail";
import { emailConnection } from "@/server/google";
import { publicBase } from "@/server/twilio";
import { fill } from "@/lib/merge";
import { BULK_MAX } from "@/lib/bulkEmail";
import { attachmentList, loadAttachments } from "@/server/attachments";
import { loadEmailKinds } from "@/server/emailKinds";

// Mass email from People (SPEC.md §6.2): one email per person from the connected Gmail, merge fields filled
// for each, an unsubscribe link and mailing address at the bottom. HQ sends it in the background (src/server/bulkEmail.ts).

const ids = z.array(z.string().trim().min(1).max(40)).min(1, "Select people first.").max(BULK_MAX, `Up to ${BULK_MAX.toLocaleString()} people at a time.`);
const ADDRESS_KEY = "email.mailingAddress";

const loadPeople = (personIds: string[], kind?: string) => bulkPeople(personIds, kind);
/** The kind picked must be one of the kinds in Admin (so its unsubscribe choice exists). */
async function checkKind(kind: string) {
  const kinds = await loadEmailKinds();
  const k = kinds.find((x) => x.toLowerCase() === kind.trim().toLowerCase());
  if (!k) throw new UserError("Pick what kind of email this is.");
  return k;
}

/** Who will get it, templates, the saved mailing address and whether Gmail is connected. */
export async function prepareBulkEmail(input: { ids: string[]; kind?: string }) {
  return guarded(null, async (user) => {
    const v = z.object({ ids, kind: z.string().max(40).optional() }).parse(input);
    const kinds = await loadEmailKinds();
    const kind = kinds.find((x) => x.toLowerCase() === (v.kind ?? "").toLowerCase());
    const [{ send, skipped }, templates, address, gmail] = await Promise.all([
      loadPeople(v.ids, kind),
      db.messageTemplate.findMany({ where: { kind: "email" }, orderBy: [{ folder: "asc" }, { name: "asc" }], select: { id: true, name: true, folder: true, subject: true, body: true } }),
      db.appSetting.findUnique({ where: { key: ADDRESS_KEY } }), emailConnection(user.id),
    ]);
    return {
      recipients: send.map((r) => ({ personId: r.personId, name: r.name })), skipped, sendsFrom: gmail?.email ?? null, kinds,
      address: typeof address?.value === "string" ? address.value : "",
      templates: templates.map((t) => ({ id: t.id, name: t.folder ? `${t.folder} · ${t.name}` : t.name, subject: t.subject, body: t.body })),
    };
  });
}

/** The email as one person will get it (merge fields filled). */
export async function previewBulkEmail(input: { personId: string; subject: string; body: string }) {
  return guarded(null, async (user) => {
    const v = z.object({ personId: z.string().min(1).max(40), subject: z.string().max(300), body: z.string().max(20000) }).parse(input);
    const { values, label } = await mergeFor(user, v.personId);
    const s = fill(v.subject, values), b = fill(v.body, values);
    return { subject: s.text, body: b.text, missing: [...new Set([...s.missing, ...b.missing])].map(label) };
  });
}

const sendSchema = z.object({
  personIds: ids,
  subject: z.string().trim().min(1, "Add a subject.").max(300), body: z.string().trim().min(1, "Write a message.").max(20000),
  address: z.string().trim().min(8, "Add your business mailing address for the footer (the law requires one on marketing email).").max(200),
  signature: z.boolean().optional(),
  kind: z.string().trim().min(1, "Pick what kind of email this is.").max(40),
  attachments: attachmentList,
});

/** Starts a mass email. HQ sends it in the background, about 40 a minute, so the page can be closed (owner report
 *  2026-11-02). Returns the send's id for the progress bar. */
export async function startBulkEmail(input: z.input<typeof sendSchema>) {
  return guarded(null, async (user) => {
    const v = sendSchema.parse(input);
    if (!(await emailConnection(user.id))) throw new UserError("Gmail isn't connected. An Admin can reconnect Google in Admin → Integrations.");
    if (!process.env.NEXTAUTH_SECRET || !publicBase()) throw new UserError("HQ's address isn't set up for unsubscribe links (NEXTAUTH_URL / NEXTAUTH_SECRET).");
    const kind = await checkKind(v.kind);
    await loadAttachments(v.attachments); // checks them now rather than on the first group
    await db.appSetting.upsert({ where: { key: ADDRESS_KEY }, update: { value: v.address }, create: { key: ADDRESS_KEY, value: v.address } });
    const { send } = await loadPeople(v.personIds, kind);
    if (!send.length) throw new UserError("Nobody here can get it (no email, or unsubscribed).");
    const job = await db.bulkEmailJob.create({ data: { userId: user.id, kind, subject: v.subject, body: v.body, address: v.address, signature: v.signature ?? true,
      batch: crypto.randomUUID(), attachments: (v.attachments ?? []) as object[], personIds: send.map((r) => r.personId) } });
    await logActivity(user.id, "create", "email", job.id, `Started mass email (${kind}) "${v.subject}" to ${send.length} ${send.length === 1 ? "person" : "people"}`);
    void sendBulkJobs().catch(() => { /* the minute timer picks it up */ });
    return { id: job.id, total: send.length };
  });
}

/** How a mass email is going (for the progress bar). */
export async function bulkEmailStatus(id: string) {
  return guarded(null, async (user) => {
    const j = await db.bulkEmailJob.findFirst({ where: { id: z.string().min(1).max(40).parse(id), userId: user.id } });
    if (!j) throw new UserError("That mass email wasn't found.");
    const total = (j.personIds as string[]).length, done = (j.doneIds as string[]).length;
    if (j.state !== "sending") revalidatePath("/people");
    return { total, done, sent: j.sent, skipped: j.skipped, failed: j.failed as { name: string; error: string }[], state: j.state, error: j.error, waiting: !!j.waitUntil && j.waitUntil > new Date() };
  });
}

/** Stops a mass email; the ones already sent stay sent. */
export async function stopBulkEmail(id: string) {
  return guarded(null, async (user) => {
    const r = await db.bulkEmailJob.updateMany({ where: { id: z.string().min(1).max(40).parse(id), userId: user.id, state: "sending" }, data: { state: "stopped", error: "Stopped." } });
    if (r.count) await logActivity(user.id, "update", "email", id, "Stopped a mass email");
  });
}
