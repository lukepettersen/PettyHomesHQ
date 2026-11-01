import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/server/db";
import { logActivity } from "@/server/activity";
import { runTrigger } from "@/server/automation";
import { textingEnabled } from "@/server/integrations";
import { publicBase, sendSms } from "@/server/twilio";
import { formatPhone, isoFromDate, normalizePhone, todayCentral } from "@/lib/normalize";
import { leadNote, type Lead } from "@/lib/leads";

// Website leads (owner request 2026-11-01): the website form posts to /api/leads?key=…; the key is a long random code
// kept in AppSetting (Admin → Integrations → Website leads shows the link and can make a new one). The link can only
// add leads; it reads nothing.

const KEY = "leads.key";

/** The secret code in the website's link; made the first time it's needed. */
export async function leadKey(): Promise<string> {
  const row = await db.appSetting.findUnique({ where: { key: KEY } });
  if (typeof row?.value === "string" && row.value) return row.value;
  return newLeadKey();
}
export async function newLeadKey(): Promise<string> {
  const key = randomBytes(24).toString("base64url");
  await db.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: key }, update: { value: key } });
  return key;
}
export const leadLink = async () => `${publicBase()}/api/leads?key=${await leadKey()}`;
export async function keyMatches(got: string): Promise<boolean> {
  const row = await db.appSetting.findUnique({ where: { key: KEY } });
  if (typeof row?.value !== "string" || !row.value) return false;
  const a = Buffer.from(got), b = Buffer.from(row.value);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** A lead from the website: an existing contact (same phone or email) gets a note; anyone new is added with Source
 *  "Website" and stage "Lead", assigned to the owner, and the "When a website lead comes in" checklists start.
 *  The owner gets a bell alert and a text either way. */
export async function receiveLead(l: Lead): Promise<{ personId: string; created: boolean }> {
  const owner = await db.user.findFirst({ where: { isOwner: true, status: { not: "DISABLED" } }, orderBy: { createdAt: "asc" } });
  if (!owner) throw new Error("No owner account");
  const phone = normalizePhone(l.phone);
  const digits = phone.length === 10 ? phone : "";
  const existing = digits || l.email ? await db.person.findFirst({ where: { deletedAt: null, OR: [...(digits ? [{ phones: { some: { normalized: digits } } }] : []), ...(l.email ? [{ emails: { some: { normalized: l.email } } }] : [])] }, select: { id: true, name: true } }) : null;
  const name = l.name || l.email || (digits ? formatPhone(digits) : "Website lead");
  const note = leadNote(l);

  const result = await db.$transaction(async (tx) => {
    if (existing) {
      await tx.timelineEntry.create({ data: { personId: existing.id, kind: "note", body: note } });
      return { personId: existing.id, created: false, name: existing.name };
    }
    const source = await tx.source.upsert({ where: { name: "Website" }, create: { name: "Website", position: 999 }, update: {} });
    const stage = await tx.stage.findFirst({ where: { name: { equals: "Lead", mode: "insensitive" } }, select: { id: true } });
    const p = await tx.person.create({ data: {
      name, mailingName: l.name || null, sourceId: source.id, stageId: stage?.id ?? null, assignedToId: owner.id, createdById: owner.id,
      phones: digits ? { create: [{ label: "Mobile", number: formatPhone(digits), normalized: digits, position: 0 }] } : undefined,
      emails: l.email ? { create: [{ label: "", address: l.email, normalized: l.email, position: 0 }] } : undefined,
      timeline: { create: [{ kind: "note", body: note }] },
    } });
    await runTrigger(tx, "lead:website", { personId: p.id, fileId: null, paId: null, start: isoFromDate(todayCentral()) }, owner.id);
    return { personId: p.id, created: true, name };
  });

  await logActivity(owner.id, "create", result.created ? "person" : "timelineEntry", result.personId, `${result.created ? "New website lead" : "Website form again"}: ${result.name}`);
  const what = `${result.created ? "New website lead" : `Website form from ${result.name} (already in HQ)`}${result.created ? `: ${result.name}` : ""}`;
  const contact = [digits && formatPhone(digits), l.email].filter(Boolean).join(" · ");
  await db.notification.create({ data: { toId: owner.id, personId: result.personId, alert: true, text: `${what}${contact ? ` · ${contact}` : ""}` } });
  // A text to the owner's cell from their HQ number, so they can call fast. Message bodies aren't logged.
  if (owner.textNumber && owner.forwardTo && (await textingEnabled())) {
    const body = `${what}${contact ? `\n${contact}` : ""}${l.message ? `\n"${l.message.slice(0, 200)}"` : ""}\n${publicBase()}/people/${result.personId}`;
    const r = await sendSms({ from: owner.textNumber, to: owner.forwardTo, body });
    if (r.ok) await db.textMessage.create({ data: { ourNumber: owner.textNumber, theirNumber: normalizePhone(owner.forwardTo), direction: "out", body, twilioSid: r.sid, status: r.status, readAt: new Date() } }).catch(() => null);
  }
  return { personId: result.personId, created: result.created };
}
