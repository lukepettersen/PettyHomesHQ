"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { guarded, UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { cachedFubPeople, fubKeySet, loadFromFub } from "@/server/fub";
import { applyPlan, summarize, type HqPerson, type Plan } from "@/lib/fubImport";
import { isPartnerType } from "@/lib/partners";
import { dateFromIso, normalizeEmail, normalizePhone } from "@/lib/normalize";

// Admin → Import from Follow Up Boss (SPEC.md §15). Admins only. Nothing in Follow Up Boss is changed.

export async function loadFub() {
  return guarded("manageUsers", async (user) => {
    if (!fubKeySet()) throw new UserError("Add FUB_API_KEY in Railway → your HQ app → Variables first.");
    const n = await loadFromFub().catch((e: Error) => { throw new UserError(e.message); });
    await logActivity(user.id, "update", "import", "fub", `Loaded ${n} people from Follow Up Boss (read only)`);
    revalidatePath("/admin/import");
    return { count: n };
  });
}

const label = z.string().max(200);
const planSchema = z.object({
  fields: z.object({ mailingName: label, homeiversary: label, referredBy: label, birthdays: z.array(label).max(12) }),
  stages: z.record(z.string().max(200), z.object({ action: z.enum(["import", "skip"]), stage: z.string().trim().max(80), followUp: z.number().int().min(1).max(3650).nullable(), type: z.string().max(20).nullable() })),
  tags: z.record(z.string().max(200), z.string().regex(/^(keep|skip|type:\w+)$/)),
  sources: z.record(z.string().max(200), z.object({ source: z.string().trim().max(80), type: z.string().max(20).nullable() })),
  agents: z.record(z.string().max(200), z.string().max(40).nullable()),
});

export async function savePlan(input: unknown) {
  return guarded("manageUsers", async (user) => {
    const plan = planSchema.parse(input);
    for (const r of Object.values(plan.stages)) if (r.action === "import" && !r.stage) throw new UserError("Every imported FUB stage needs an HQ stage.");
    await db.appSetting.upsert({ where: { key: "fub.plan" }, update: { value: plan }, create: { key: "fub.plan", value: plan } });
    await logActivity(user.id, "update", "import", "fub", "Saved the Follow Up Boss matching");
    revalidatePath("/admin/import");
  });
}

async function savedPlan(): Promise<Plan> {
  const row = await db.appSetting.findUnique({ where: { key: "fub.plan" } });
  if (!row) throw new UserError("Save the matching first.");
  return planSchema.parse(row.value) as Plan;
}

/** Who is already in HQ: FUB ids, emails and phones, so nobody is added twice. */
async function existing() {
  const [ids, emails, phones] = await Promise.all([
    db.person.findMany({ where: { fubId: { not: null } }, select: { fubId: true } }),
    db.email.findMany({ where: { person: { deletedAt: null } }, select: { normalized: true } }),
    db.phone.findMany({ where: { person: { deletedAt: null } }, select: { normalized: true } }),
  ]);
  return { ids: new Set(ids.map((x) => x.fubId!)), emails: new Set(emails.map((x) => x.normalized)), phones: new Set(phones.map((x) => x.normalized).filter((x) => x.length >= 7)) };
}
const isDuplicate = (p: HqPerson, ex: Awaited<ReturnType<typeof existing>>) =>
  ex.ids.has(p.fubId) || p.emails.some((e) => ex.emails.has(normalizeEmail(e.address))) || p.phones.some((x) => ex.phones.has(normalizePhone(x.number)));

/** Totals and sample people exactly as they'll be saved, using the saved matching. */
export async function previewImport() {
  return guarded("manageUsers", async () => {
    const plan = await savedPlan();
    const { people } = await cachedFubPeople();
    const ex = await existing();
    const out = { total: people.length, willAdd: 0, skipped: 0, duplicates: 0, byStage: {} as Record<string, number>, byType: {} as Record<string, number> };
    const samples: HqPerson[] = [];
    const seenStage = new Map<string, number>();
    for (const p of people) {
      const h = applyPlan(p, plan);
      if (!h) { out.skipped++; continue; }
      if (isDuplicate(h, ex)) { out.duplicates++; continue; }
      out.willAdd++;
      out.byStage[h.stage] = (out.byStage[h.stage] ?? 0) + 1;
      if (h.partnerType) out.byType[h.partnerType] = (out.byType[h.partnerType] ?? 0) + 1;
      // A few of each stage, so every kind of person shows in the preview.
      const n = seenStage.get(h.stage) ?? 0;
      if (n < 4 && samples.length < 30) { samples.push(h); seenStage.set(h.stage, n + 1); }
    }
    return { ...out, samples };
  });
}

const CHUNK = 150;
/** Adds the next group of people (the screen calls this repeatedly and shows progress). */
export async function runImport(input: { batchId: string | null; offset: number }) {
  return guarded("manageUsers", async (user) => {
    const v = z.object({ batchId: z.string().max(40).nullable(), offset: z.number().int().min(0) }).parse(input);
    const plan = await savedPlan();
    const { people } = await cachedFubPeople();
    const batch = v.batchId ? await db.importBatch.findUnique({ where: { id: v.batchId } }) : await db.importBatch.create({ data: { createdById: user.id } });
    if (!batch || batch.undoneAt) throw new UserError("That import was undone. Start again.");
    const ex = await existing();
    // Stages, sources and tags HQ doesn't have yet are created (named as on the matching screen).
    const [stages, sources, tags] = await Promise.all([db.stage.findMany(), db.source.findMany(), db.tag.findMany()]);
    const idOf = async <T extends { id: string; name: string }>(list: T[], name: string, make: (n: string) => Promise<T>) => {
      if (!name) return null;
      const hit = list.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (hit) return hit.id;
      const made = await make(name); list.push(made); return made.id;
    };
    let added = 0, dupes = 0;
    const slice = people.slice(v.offset, v.offset + CHUNK);
    for (const p of slice) {
      const h = applyPlan(p, plan);
      if (!h) continue;
      if (isDuplicate(h, ex)) { dupes++; continue; }
      const stageId = await idOf(stages, h.stage, (n) => db.stage.create({ data: { name: n, position: stages.length } }));
      const sourceId = await idOf(sources, h.source, (n) => db.source.create({ data: { name: n, position: sources.length } }));
      const tagIds = (await Promise.all(h.tags.map((t) => idOf(tags, t, (n) => db.tag.create({ data: { name: n } }))))).filter((x): x is string => !!x);
      const emails = [...new Map(h.emails.map((e) => [normalizeEmail(e.address), e])).entries()];
      const phones = [...new Map(h.phones.map((x) => [normalizePhone(x.number), x])).entries()];
      await db.person.create({
        data: {
          name: h.name, mailingName: h.mailingName || h.name, referredBy: h.referredBy || null, address: h.address || null,
          stageId, sourceId, followUpDays: h.followUpDays, partnerType: h.partnerType && isPartnerType(h.partnerType) ? h.partnerType : null,
          assignedToId: h.assignedToId, createdById: user.id, fubId: h.fubId, importBatchId: batch.id,
          emails: { create: emails.map(([n, e], i) => ({ address: e.address, normalized: n, label: e.label, position: i })) },
          phones: { create: phones.map(([n, x], i) => ({ number: x.number, normalized: n, label: x.label || "Mobile", position: i })) },
          tags: { create: tagIds.map((tagId) => ({ tagId })) },
          dates: { create: [...h.birthdays.map((b) => ({ kind: "birthday", whose: b.whose, date: dateFromIso(b.date) })), ...(h.homeiversary ? [{ kind: "homeiversary", date: dateFromIso(h.homeiversary) }] : [])] },
        },
      });
      ex.ids.add(h.fubId); emails.forEach(([n]) => ex.emails.add(n)); phones.forEach(([n]) => n.length >= 7 && ex.phones.add(n));
      added++;
    }
    await db.importBatch.update({ where: { id: batch.id }, data: { added: { increment: added }, duplicates: { increment: dupes } } });
    const next = v.offset + slice.length, done = next >= people.length;
    if (done) {
      const b = await db.importBatch.findUnique({ where: { id: batch.id } });
      await logActivity(user.id, "create", "import", batch.id, `Imported ${b?.added ?? 0} people from Follow Up Boss (${b?.duplicates ?? 0} already in HQ)`);
      revalidatePath("/admin/import"); revalidatePath("/people");
    }
    return { batchId: batch.id, next, total: people.length, done, added, dupes };
  });
}

/** Undo import: removes everyone that import added (anyone with files attached since is kept). */
export async function undoImport(batchId: string) {
  return guarded("manageUsers", async (user) => {
    const id = z.string().min(1).max(40).parse(batchId);
    const b = await db.importBatch.findUnique({ where: { id } });
    if (!b || b.undoneAt) throw new UserError("That import was already undone.");
    const removed = await db.person.deleteMany({ where: { importBatchId: id, documents: { none: {} } } });
    await db.importBatch.update({ where: { id }, data: { undoneAt: new Date() } });
    await logActivity(user.id, "delete", "import", id, `Undid a Follow Up Boss import: removed ${removed.count} people`);
    revalidatePath("/admin/import"); revalidatePath("/people");
    return { removed: removed.count };
  });
}

export async function fubSummary() {
  return guarded("manageUsers", async () => summarize((await cachedFubPeople()).people));
}
