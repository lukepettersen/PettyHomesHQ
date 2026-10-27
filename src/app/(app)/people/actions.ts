"use server";

import { isPartnerType } from "@/lib/partners";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cleanAddresses } from "@/lib/addresses";
import { db } from "@/server/db";
import { guarded, UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { coupleName, dateFromIso, formatPhone, normalizeEmail, normalizePhone } from "@/lib/normalize";
import { findMentions } from "@/lib/mentions";
import { canEditEntry } from "@/lib/timeline";
import { hasPermission, type Permission } from "@/server/permissions";
import { cleanFieldValue } from "@/lib/customFields";

const trimmed = (max = 200) => z.string().trim().max(max);
const optionalId = z.string().trim().max(40).optional().nullable().transform((v) => v || null);
const contactRow = z.object({ label: trimmed(40).default(""), value: trimmed(200) });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

function cleanPhones(rows: z.infer<typeof contactRow>[]) {
  return rows.filter((r) => r.value).map((r, position) => ({ label: r.label || "Mobile", number: formatPhone(r.value), normalized: normalizePhone(r.value), position }));
}
function cleanEmails(rows: z.infer<typeof contactRow>[]) {
  return rows.filter((r) => r.value).map((r, position) => {
    if (!z.string().email().safeParse(r.value).success) throw new UserError(`"${r.value}" isn't a valid email.`);
    return { label: r.label, address: r.value, normalized: normalizeEmail(r.value), position };
  });
}

// ---------- Add person ----------
const createSchema = z.object({
  first: trimmed(80).min(1, "Add a first name"),
  last: trimmed(80).default(""),
  phone: trimmed(40).default(""),
  email: trimmed(200).default(""),
  second: z.object({ first: trimmed(80), last: trimmed(80), phone: trimmed(40), email: trimmed(200) }).optional(),
  stageId: optionalId,
  sourceId: optionalId,
  partnerType: z.string().max(20).optional().transform((x) => (x && isPartnerType(x) ? x : null)),
  company: trimmed(160).default(""),
});

export async function createPerson(input: z.input<typeof createSchema>) {
  return guarded(null, async (user) => {
    const v = createSchema.parse(input);
    const two = v.second?.first ? v.second : undefined;
    const name = coupleName({ first: v.first, last: v.last }, two);
    const phones = cleanPhones([{ label: two ? v.first : "Mobile", value: v.phone }, ...(two ? [{ label: two.first, value: two.phone }] : [])]);
    const emails = cleanEmails([{ label: two ? v.first : "", value: v.email }, ...(two ? [{ label: two.first, value: two.email }] : [])]);
    const p = await db.person.create({
      data: { name, mailingName: name, stageId: v.stageId, sourceId: v.sourceId, partnerType: v.partnerType, company: v.company || null, createdById: user.id, assignedToId: user.id, phones: { create: phones }, emails: { create: emails } },
    });
    await logActivity(user.id, "create", "person", p.id, `Added ${name}`);
    revalidatePath("/people");
    return { id: p.id, name };
  });
}

// ---------- Contact info card ----------
const addressRow = z.object({ label: trimmed(40).default(""), value: trimmed(300), mailing: z.boolean().default(false) });
const infoSchema = z.object({ id: z.string(), name: trimmed(160).min(1, "Name can't be empty"), addresses: z.array(addressRow).max(10).default([]), phones: z.array(contactRow).max(10), emails: z.array(contactRow).max(10) });

export async function updateContactInfo(input: z.input<typeof infoSchema>) {
  return guarded(null, async (user) => {
    const v = infoSchema.parse(input);
    const phones = cleanPhones(v.phones), emails = cleanEmails(v.emails);
    // Several labelled addresses; the mailing one (or the only one) is also kept on the person for mailers and merge fields.
    const addr = cleanAddresses(v.addresses);
    await db.$transaction([
      db.phone.deleteMany({ where: { personId: v.id } }),
      db.email.deleteMany({ where: { personId: v.id } }),
      db.address.deleteMany({ where: { personId: v.id } }),
      db.person.update({ where: { id: v.id, deletedAt: null }, data: { name: v.name, address: addr.primary, phones: { create: phones }, emails: { create: emails }, addresses: { create: addr.rows } } }),
    ]);
    await logActivity(user.id, "update", "person", v.id, `Updated contact info for ${v.name}`);
    revalidatePath(`/people/${v.id}`);
  });
}

// ---------- Details card ----------
const detailsSchema = z.object({ id: z.string(), stageId: optionalId, sourceId: optionalId, assignedToId: optionalId, followUpDays: z.coerce.number().int().min(0).max(3650).nullable(), mailingName: trimmed(160).default(""), referredBy: trimmed(160).default(""),
  partnerType: z.string().max(20).optional().transform((x) => (x && isPartnerType(x) ? x : null)), company: trimmed(160).default(""), kids: trimmed(200).default("") });

export async function updateDetails(input: z.input<typeof detailsSchema>) {
  return guarded(null, async (user) => {
    const v = detailsSchema.parse(input);
    const p = await db.person.update({
      where: { id: v.id, deletedAt: null },
      data: { stageId: v.stageId, sourceId: v.sourceId, assignedToId: v.assignedToId, followUpDays: v.followUpDays || null, mailingName: v.mailingName || null, referredBy: v.referredBy || null, partnerType: v.partnerType, company: v.company || null, kids: v.kids || null },
    });
    await logActivity(user.id, "update", "person", v.id, `Updated details for ${p.name}`);
    revalidatePath(`/people/${v.id}`);
  });
}

// ---------- Tags ----------
export async function addTag(personId: string, tagName: string) {
  return guarded(null, async (user) => {
    const name = trimmed(60).min(1, "Type a tag").parse(tagName);
    const existing = await db.tag.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    const tag = existing ?? (await db.tag.create({ data: { name } }));
    await db.personTag.upsert({ where: { personId_tagId: { personId, tagId: tag.id } }, update: {}, create: { personId, tagId: tag.id } });
    await logActivity(user.id, "update", "person", personId, `Added tag ${tag.name}`);
    revalidatePath(`/people/${personId}`);
  });
}

export async function removeTag(personId: string, tagName: string) {
  return guarded(null, async (user) => {
    const tag = await db.tag.findUnique({ where: { name: tagName } });
    if (tag) await db.personTag.deleteMany({ where: { personId, tagId: tag.id } });
    await logActivity(user.id, "update", "person", personId, `Removed tag ${tagName}`);
    revalidatePath(`/people/${personId}`);
  });
}

// ---------- Important Dates ----------
const datesSchema = z.object({ id: z.string(), birthdays: z.array(z.object({ whose: trimmed(60), date: isoDate })).max(12), homeiversary: isoDate.or(z.literal("")) });

export async function updateImportantDates(input: z.input<typeof datesSchema>) {
  return guarded(null, async (user) => {
    const v = datesSchema.parse(input);
    const rows = [
      ...v.birthdays.map((b) => ({ kind: "birthday", whose: b.whose, date: dateFromIso(b.date) })),
      ...(v.homeiversary ? [{ kind: "homeiversary", whose: "", date: dateFromIso(v.homeiversary) }] : []),
    ];
    await db.$transaction([db.importantDate.deleteMany({ where: { personId: v.id } }), db.importantDate.createMany({ data: rows.map((r) => ({ ...r, personId: v.id })) })]);
    await logActivity(user.id, "update", "person", v.id, "Updated important dates");
    revalidatePath(`/people/${v.id}`);
  });
}

// ---------- Timeline (notes, logged calls, logged texts) ----------
const entrySchema = z.object({ personId: z.string(), kind: z.enum(["note", "call", "text"]), body: trimmed(10000).min(1, "Type something first"), outcome: trimmed(40).optional() });

export async function addTimelineEntry(input: z.input<typeof entrySchema>) {
  return guarded(null, async (user) => {
    const v = entrySchema.parse(input);
    const person = await db.person.findFirst({ where: { id: v.personId, deletedAt: null }, select: { id: true, name: true } });
    if (!person) throw new UserError("That person was deleted.");
    // @mentions notify each teammate named (not the author). Gmail emails follow in Phase 3.
    const team = await db.user.findMany({ where: { status: { not: "DISABLED" } }, select: { id: true, name: true } });
    const mentioned = findMentions(v.body, team).filter((m) => m.id !== user.id);
    const snippet = v.body.length > 140 ? `${v.body.slice(0, 140)}…` : v.body;
    await db.$transaction([
      db.timelineEntry.create({ data: { personId: v.personId, kind: v.kind, body: v.body, outcome: v.kind === "call" ? v.outcome ?? null : null, authorId: user.id } }),
      db.person.update({ where: { id: v.personId }, data: { lastContactAt: new Date(), ...(v.kind === "text" ? { lastTextAt: new Date() } : {}) } }),
      ...mentioned.map((m) => db.notification.create({ data: { toId: m.id, fromId: user.id, personId: v.personId, text: `${user.name.split(" ")[0]} mentioned you on ${person.name}: "${snippet}"` } })),
    ]);
    await logActivity(user.id, "create", "timeline", v.personId, `Logged ${v.kind} for ${person.name}${mentioned.length ? ` (mentioned ${mentioned.map((m) => m.name).join(", ")})` : ""}`);
    revalidatePath(`/people/${v.personId}`);
    return { mentioned: mentioned.map((m) => m.name.split(" ")[0]) };
  });
}

/** Edit a note, logged call or logged text: its author, or anyone allowed to delete records. */
async function editableEntry(user: { id: string; permissions: string[] }, id: string) {
  const e = await db.timelineEntry.findFirst({ where: { id, deletedAt: null, person: { deletedAt: null } } });
  if (!e) throw new UserError("That entry was deleted.");
  if (!canEditEntry(e)) throw new UserError("Only notes, logged calls and logged texts can be changed.");
  if (e.authorId !== user.id && !hasPermission(user.permissions as Permission[], "deleteRecords")) throw new UserError("Only the person who wrote it can change it.");
  return e;
}

const editEntrySchema = z.object({ id: z.string().max(40), body: trimmed(10000).min(1, "Type something first"), outcome: trimmed(40).optional() });

export async function editTimelineEntry(input: z.input<typeof editEntrySchema>) {
  return guarded(null, async (user) => {
    const v = editEntrySchema.parse(input);
    const e = await editableEntry(user, v.id);
    await db.timelineEntry.update({ where: { id: e.id }, data: { body: v.body, ...(e.kind === "call" && v.outcome ? { outcome: v.outcome } : {}) } });
    await logActivity(user.id, "update", "timeline", e.personId, `Edited a ${e.kind} (was: "${e.body.length > 80 ? `${e.body.slice(0, 80)}…` : e.body}")`);
    revalidatePath(`/people/${e.personId}`);
  });
}

/** Delete a note, logged call or logged text (two-step in the UI; kept as deleted, not erased). */
export async function deleteTimelineEntry(id: string) {
  return guarded(null, async (user) => {
    const e = await editableEntry(user, z.string().max(40).parse(id));
    await db.timelineEntry.update({ where: { id: e.id }, data: { deletedAt: new Date() } });
    await logActivity(user.id, "delete", "timeline", e.personId, `Deleted a ${e.kind}`);
    revalidatePath(`/people/${e.personId}`);
  });
}

// ---------- More details (custom fields) ----------
const customSchema = z.object({ personId: z.string(), values: z.array(z.object({ fieldId: z.string().max(40), value: z.string().max(500) })).max(50) });

export async function updateCustomValues(input: z.input<typeof customSchema>) {
  return guarded(null, async (user) => {
    const v = customSchema.parse(input);
    const person = await db.person.findFirst({ where: { id: v.personId, deletedAt: null }, select: { id: true, name: true } });
    if (!person) throw new UserError("That person was deleted.");
    const fields = new Map((await db.customField.findMany()).map((f) => [f.id, f]));
    const ops = v.values.map(({ fieldId, value }) => {
      const f = fields.get(fieldId);
      if (!f) throw new UserError("A field was removed in Admin. Refresh the page.");
      let clean: string;
      try { clean = cleanFieldValue(f.type, f.options, value); } catch (e) { throw new UserError(`${f.name}: ${(e as Error).message}`); }
      const key = { personId_fieldId: { personId: v.personId, fieldId } };
      return clean
        ? db.customValue.upsert({ where: key, create: { personId: v.personId, fieldId, value: clean }, update: { value: clean } })
        : db.customValue.deleteMany({ where: { personId: v.personId, fieldId } });
    });
    await db.$transaction(ops);
    await logActivity(user.id, "update", "person", v.personId, `Updated more details for ${person.name}`);
    revalidatePath(`/people/${v.personId}`);
  });
}

// ---------- Delete (to Trash) ----------
export async function deletePerson(personId: string) {
  return guarded("deleteRecords", async (user) => {
    const p = await db.person.update({ where: { id: personId, deletedAt: null }, data: { deletedAt: new Date() } });
    await logActivity(user.id, "delete", "person", personId, `Moved ${p.name} to Trash`);
    revalidatePath("/people");
  });
}

// ---------- Bulk actions on selected people ----------
const bulkSchema = z.object({
  ids: z.array(z.string()).min(1, "Select someone first").max(20000),
  action: z.enum(["addTag", "removeTag", "stage", "followUp", "assign", "contacted"]),
  value: z.string().trim().max(80),
});

export async function bulkUpdate(input: z.input<typeof bulkSchema>) {
  return guarded(null, async (user) => {
    const v = bulkSchema.parse(input);
    const where = { id: { in: v.ids }, deletedAt: null };
    if (v.action === "addTag" || v.action === "removeTag") {
      const name = v.value;
      if (!name) throw new UserError("Pick a tag");
      const tag = (await db.tag.findFirst({ where: { name: { equals: name, mode: "insensitive" } } })) ?? (v.action === "addTag" ? await db.tag.create({ data: { name } }) : null);
      if (!tag) throw new UserError(`There's no tag called "${name}". Pick one from the list.`);
      if (v.action === "addTag") {
        const r = await db.personTag.createMany({ data: v.ids.map((personId) => ({ personId, tagId: tag.id })), skipDuplicates: true });
        await logActivity(user.id, "update", "person", null, `Added tag "${tag.name}" to ${r.count} people`);
        revalidatePath("/people");
        return { message: `Added "${tag.name}" to ${r.count} ${r.count === 1 ? "person" : "people"}${r.count < v.ids.length ? ` (${v.ids.length - r.count} already had it)` : ""}.` };
      }
      // Say how many it came off, so a tag nobody selected had shows as 0 rather than "Updated" (owner 2026-10-27).
      const r = await db.personTag.deleteMany({ where: { tagId: tag.id, personId: { in: v.ids } } });
      await logActivity(user.id, "update", "person", null, `Removed tag "${tag.name}" from ${r.count} people`);
      revalidatePath("/people");
      return { message: r.count ? `Removed "${tag.name}" from ${r.count} ${r.count === 1 ? "person" : "people"}.` : `None of the selected people had "${tag.name}".` };
    } else if (v.action === "stage") {
      await db.person.updateMany({ where, data: { stageId: v.value || null } });
    } else if (v.action === "contacted") {
      // "Mark texted": last text (and last contact) move up to that day (never back), restarting their follow-up clock.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v.value)) throw new UserError("Pick a date");
      const at = new Date(`${v.value}T17:00:00.000Z`); // midday Central
      if (at.getTime() > Date.now() + 86400000) throw new UserError("Pick today or an earlier day.");
      await db.person.updateMany({ where: { ...where, OR: [{ lastTextAt: null }, { lastTextAt: { lt: at } }] }, data: { lastTextAt: at } });
      await db.person.updateMany({ where: { ...where, OR: [{ lastContactAt: null }, { lastContactAt: { lt: at } }] }, data: { lastContactAt: at } });
    } else if (v.action === "followUp") {
      await db.person.updateMany({ where, data: { followUpDays: v.value ? Number(v.value) || null : null } });
    } else {
      await db.person.updateMany({ where, data: { assignedToId: v.value || null } });
    }
    await logActivity(user.id, "update", "person", null, `Bulk ${v.action} on ${v.ids.length} people`);
    revalidatePath("/people");
  });
}

export async function bulkDelete(ids: string[]) {
  return guarded("deleteRecords", async (user) => {
    const list = z.array(z.string()).min(1).max(20000).parse(ids);
    const r = await db.person.updateMany({ where: { id: { in: list }, deletedAt: null }, data: { deletedAt: new Date() } });
    await logActivity(user.id, "delete", "person", null, `Moved ${r.count} people to Trash`);
    revalidatePath("/people");
    return { count: r.count };
  });
}
