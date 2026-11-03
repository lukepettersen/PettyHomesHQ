import "server-only";
import { db } from "@/server/db";
import { logActivity } from "@/server/activity";

/**
 * Combines two contacts into one (owner request 2026-11-03, "combine them" by text): everything on `goneId` (phones,
 * emails, addresses, dates, tags, custom fields, timeline, tasks, deals, appointments, files, texts, calls, showings,
 * scheduled texts/emails) moves to `keepId`; blank details on the kept contact are filled from the other; the other
 * goes to Trash. Duplicate phones and emails are kept once. Returns the kept contact's name.
 */
export async function mergeContacts(userId: string, keepId: string, goneId: string, newName?: string): Promise<string> {
  if (keepId === goneId) throw new Error("That's the same contact.");
  return db.$transaction(async (tx) => {
    const keep = await tx.person.findFirst({ where: { id: keepId, deletedAt: null }, include: { phones: true, emails: true, addresses: true, tags: true, customValues: true } });
    const gone = await tx.person.findFirst({ where: { id: goneId, deletedAt: null }, include: { phones: true, emails: true, addresses: true, tags: true, customValues: true } });
    if (!keep || !gone) throw new Error("One of those contacts was deleted.");
    const move = { where: { personId: goneId }, data: { personId: keepId } };
    // Phones and emails: the other's ones that aren't already on the kept contact, after the kept ones.
    const havePhones = new Set(keep.phones.map((p) => p.normalized)), haveEmails = new Set(keep.emails.map((e) => e.normalized));
    let pos = Math.max(-1, ...keep.phones.map((p) => p.position));
    for (const p of gone.phones) {
      if (havePhones.has(p.normalized)) await tx.phone.delete({ where: { id: p.id } });
      else { havePhones.add(p.normalized); await tx.phone.update({ where: { id: p.id }, data: { personId: keepId, position: ++pos } }); }
    }
    pos = Math.max(-1, ...keep.emails.map((e) => e.position));
    for (const e of gone.emails) {
      if (haveEmails.has(e.normalized)) await tx.email.delete({ where: { id: e.id } });
      else { haveEmails.add(e.normalized); await tx.email.update({ where: { id: e.id }, data: { personId: keepId, position: ++pos } }); }
    }
    const keepMailing = keep.addresses.some((a) => a.mailing) || !!keep.address;
    pos = Math.max(-1, ...keep.addresses.map((a) => a.position));
    for (const a of gone.addresses) {
      if (keep.addresses.some((k) => k.value.trim().toLowerCase() === a.value.trim().toLowerCase())) await tx.address.delete({ where: { id: a.id } });
      else await tx.address.update({ where: { id: a.id }, data: { personId: keepId, position: ++pos, mailing: keepMailing ? false : a.mailing } });
    }
    // Tags and custom fields: kept once.
    for (const t of gone.tags) await tx.personTag.upsert({ where: { personId_tagId: { personId: keepId, tagId: t.tagId } }, update: {}, create: { personId: keepId, tagId: t.tagId } });
    await tx.personTag.deleteMany({ where: { personId: goneId } });
    for (const c of gone.customValues) if (!keep.customValues.some((k) => k.fieldId === c.fieldId)) await tx.customValue.create({ data: { personId: keepId, fieldId: c.fieldId, value: c.value } });
    await tx.customValue.deleteMany({ where: { personId: goneId } });
    // Everything else that belongs to a contact.
    // One at a time: queries inside a transaction share one connection.
    for (const run of [
      () => tx.importantDate.updateMany(move), () => tx.timelineEntry.updateMany(move), () => tx.notification.updateMany(move), () => tx.task.updateMany(move),
      () => tx.clientFile.updateMany(move), () => tx.offer.updateMany(move), () => tx.paPartner.updateMany(move), () => tx.appointment.updateMany(move), () => tx.document.updateMany(move),
      () => tx.textMessage.updateMany(move), () => tx.emailTrack.updateMany(move), () => tx.phoneCall.updateMany(move), () => tx.scheduledText.updateMany(move), () => tx.scheduledEmail.updateMany(move),
      () => tx.showing.updateMany({ where: { agentId: goneId }, data: { agentId: keepId } }), () => tx.showing.updateMany({ where: { sellerId: goneId }, data: { sellerId: keepId } }),
    ]) await run();
    const later = (a: Date | null, b: Date | null) => (a && b ? (a > b ? a : b) : a ?? b);
    const name = (newName ?? "").trim().slice(0, 120) || keep.name;
    await tx.person.update({ where: { id: keepId }, data: {
      name, mailingName: keep.mailingName === keep.name && name !== keep.name ? name : keep.mailingName ?? gone.mailingName,
      address: keep.address ?? gone.address, stageId: keep.stageId ?? gone.stageId, sourceId: keep.sourceId ?? gone.sourceId, referredBy: keep.referredBy ?? gone.referredBy,
      kids: keep.kids ?? gone.kids, partnerType: keep.partnerType ?? gone.partnerType, company: keep.company ?? gone.company, followUpDays: keep.followUpDays ?? gone.followUpDays,
      assignedToId: keep.assignedToId ?? gone.assignedToId, lastContactAt: later(keep.lastContactAt, gone.lastContactAt), lastTextAt: later(keep.lastTextAt, gone.lastTextAt),
    } });
    await tx.person.update({ where: { id: goneId }, data: { deletedAt: new Date() } });
    await tx.timelineEntry.create({ data: { personId: keepId, kind: "system", body: `Combined with "${gone.name}" (their phones, emails, notes, tasks and deals are here now; the other contact is in Trash).`, authorId: userId } });
    await logActivity(userId, "update", "person", keepId, `Combined "${gone.name}" into "${name}"`);
    return name;
  });
}
