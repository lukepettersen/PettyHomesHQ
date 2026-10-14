import "server-only";
import { db } from "@/server/db";
import { logActivity } from "@/server/activity";
import { normalizeEmail, normalizePhone } from "@/lib/normalize";
import { partnerFromAnswers, sectionPartnerType } from "@/lib/partners";
import type { PaSection } from "@/lib/pa";

/**
 * After a purchase agreement is saved: remember which partner contact was picked for each people section,
 * and turn typed-in partners ticked "Save as contact" into contacts (stage Industry Partners) so they're
 * in the dropdown next time (SPEC.md §6.4). An existing contact with the same email is linked instead.
 */
export async function savePaPartners(paId: string, form: PaSection[], answers: Record<string, string>, picked: Record<string, string>, saveAsContact: string[], userId: string) {
  const people = form.filter((s) => s.people);
  const links: { sectionId: string; personId: string }[] = [];
  const ids = Object.values(picked);
  const valid = new Set((await db.person.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true } })).map((p) => p.id));
  for (const s of people) if (picked[s.id] && valid.has(picked[s.id])) links.push({ sectionId: s.id, personId: picked[s.id] });

  const stage = await db.stage.findFirst({ where: { name: { equals: "Industry Partners", mode: "insensitive" } } });
  for (const s of people.filter((x) => saveAsContact.includes(x.id) && !links.some((l) => l.sectionId === x.id))) {
    const p = partnerFromAnswers(s, answers);
    if (!p.name) continue;
    const email = p.email ? normalizeEmail(p.email) : "";
    const existing = email ? await db.email.findFirst({ where: { normalized: email, person: { deletedAt: null } }, select: { personId: true } }) : null;
    if (existing) { links.push({ sectionId: s.id, personId: existing.personId }); continue; }
    const created = await db.person.create({
      data: {
        name: p.name, mailingName: p.name, company: p.company || null, partnerType: sectionPartnerType(s) ?? "other", stageId: stage?.id ?? null, createdById: userId, assignedToId: userId,
        emails: email ? { create: [{ address: p.email.trim(), normalized: email, label: "Work" }] } : undefined,
        phones: p.phone && normalizePhone(p.phone).length >= 7 ? { create: [{ number: p.phone.trim(), normalized: normalizePhone(p.phone), label: "Work" }] } : undefined,
      },
    });
    await logActivity(userId, "create", "person", created.id, `Added ${p.name} (${s.name}) from a purchase agreement`);
    links.push({ sectionId: s.id, personId: created.id });
  }
  await db.$transaction([db.paPartner.deleteMany({ where: { paId } }), db.paPartner.createMany({ data: links.map((l) => ({ paId, ...l })) })]);
}
