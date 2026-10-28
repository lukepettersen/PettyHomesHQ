"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { guarded, UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { hasPermission } from "@/server/permissions";
import { loadForm } from "@/server/pa";
import { savePaPartners } from "@/server/partners";
import { syncContract } from "@/server/google";
import { syncSalesRow } from "@/server/salesSheet";
import { dateFromIso, isoFromDate, todayCentral } from "@/lib/normalize";
import { apptIso, closeStepsForWaived, contractAnchors, factsOf, redateContract, runTrigger } from "@/server/automation";
import { cleanPaAnswers, formProblem, KEY_DATES, type DateKey, type DateStatus, type PaSection } from "@/lib/pa";

const id = z.string().trim().min(1).max(40);
const sideSchema = z.enum(["buyer", "seller"]);
const answersSchema = z.record(z.string(), z.string().max(500));
const dateKey = z.enum(KEY_DATES.map(([k]) => k) as [DateKey, ...DateKey[]]);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {});
const label = (k: DateKey) => KEY_DATES.find(([x]) => x === k)![1];

function refresh(personId: string) {
  revalidatePath(`/people/${personId}`);
  revalidatePath("/pipeline");
}

function clean(form: PaSection[], answers: Record<string, string>, canComm: boolean) {
  try { return cleanPaAnswers(form, answers, { skipCommission: !canComm }); } catch (e) { throw new UserError((e as Error).message); }
}
const dateData = (dates: Record<DateKey, string | null>) => Object.fromEntries(KEY_DATES.map(([k]) => [k, dates[k] ? dateFromIso(dates[k]!) : null]));

// ---------- Add ----------
const partnerLinks = { partners: z.record(z.string().max(40), id).optional(), saveAsContact: z.array(z.string().max(40)).max(20).optional() };
const addSchema = z.object({ fileId: id, side: sideSchema, answers: answersSchema, ...partnerLinks });

export async function addPurchaseAgreement(input: z.input<typeof addSchema>) {
  return guarded(null, async (user) => {
    const v = addSchema.parse(input);
    const file = await db.clientFile.findFirst({ where: { id: v.fileId, deletedAt: null, closedAt: null }, include: { person: { select: { name: true } } } });
    if (!file) throw new UserError("That file was closed or deleted.");
    if (await db.purchaseAgreement.findFirst({ where: { fileId: file.id, state: "active", deletedAt: null } })) throw new UserError("This file already has an active contract. Mark it closed or fell through first.");
    const canComm = hasPermission(user.permissions, "seeCommissions");
    const form = await loadForm(v.side);
    const c = clean(form, v.answers, canComm);
    const today = isoFromDate(todayCentral());
    const pa = await db.$transaction(async (tx) => {
     const created = await tx.purchaseAgreement.create({
      data: {
        fileId: file.id, side: v.side, address: c.address, price: c.price, answers: c.answers, writtenStatementNA: c.writtenStatementNA, ...dateData(c.dates),
        // Dates already in the past when the contract is entered count as met.
        dateStatus: Object.fromEntries(KEY_DATES.filter(([k]) => c.dates[k] && c.dates[k]! < today).map(([k]) => [k, "met"])),
        createdById: user.id,
        ...(canComm && (c.commission.commission || c.commission.bac) ? { commission: { create: c.commission } } : {}),
      },
     });
     const n = await runTrigger(tx, `pa:${v.side}`, {
       personId: file.personId, fileId: file.id, paId: created.id, start: c.dates.finalAcceptance ?? today, dates: { ...c.dates, inspAppt: apptIso(c.answers) }, facts: factsOf(c.answers, c.writtenStatementNA),
     }, user.id);
     return { ...created, n };
    });
    await savePaPartners(pa.id, form, c.answers, v.partners ?? {}, v.saveAsContact ?? [], user.id);
    await logActivity(user.id, "create", "purchaseAgreement", pa.id, `Added ${v.side}-side purchase agreement for ${file.person.name}: ${c.address}${pa.n ? ` (${pa.n} tasks)` : ""}`);
    await syncContract(pa.id); // Google Calendar, when connected
    await syncSalesRow(pa.id, "added"); // owner's sales Google Sheet, when set up
    refresh(file.personId);
    return { id: pa.id, tasks: pa.n };
  });
}

// ---------- Edit ----------
const editSchema = z.object({ id, answers: answersSchema, ...partnerLinks });

export async function updatePurchaseAgreement(input: z.input<typeof editSchema>) {
  return guarded(null, async (user) => {
    const v = editSchema.parse(input);
    const pa = await db.purchaseAgreement.findFirst({ where: { id: v.id, deletedAt: null }, include: { file: { include: { person: { select: { name: true } } } } } });
    if (!pa) throw new UserError("That contract was deleted.");
    const canComm = hasPermission(user.permissions, "seeCommissions");
    const form = await loadForm(pa.side as "buyer" | "seller");
    const c = clean(form, v.answers, canComm);
    // Moving a date that was still pending marks it Extended and remembers the original.
    const status = obj(pa.dateStatus), orig = obj(pa.originalDates);
    const moved: string[] = [];
    for (const [k] of KEY_DATES) {
      const before = pa[k] ? isoFromDate(pa[k]!) : null, after = c.dates[k];
      if (before && after && before !== after) {
        moved.push(label(k));
        if (!status[k] || status[k] === "pending" || status[k] === "extended") { status[k] = "extended"; orig[k] = orig[k] ?? before; }
      }
    }
    await db.$transaction(async (tx) => {
      await tx.purchaseAgreement.update({
        where: { id: pa.id },
        data: { address: c.address, price: c.price, answers: c.answers, writtenStatementNA: c.writtenStatementNA, ...dateData(c.dates), dateStatus: status, originalDates: orig },
      });
      if (canComm) await tx.paCommission.upsert({ where: { paId: pa.id }, update: c.commission, create: { paId: pa.id, ...c.commission } });
      await redateContract(tx, pa.id);
    });
    await savePaPartners(pa.id, form, c.answers, v.partners ?? {}, v.saveAsContact ?? [], user.id);
    await logActivity(user.id, "update", "purchaseAgreement", pa.id, `Updated purchase agreement for ${pa.file.person.name}${moved.length ? ` (moved ${moved.join(", ")})` : ""}`);
    await syncContract(pa.id);
    await syncSalesRow(pa.id, "changed"); // owner's sales Google Sheet, when set up
    refresh(pa.file.personId);
  });
}

// ---------- Key date tiles: + Add date, Met, Waived, Extended, Pending ----------
const dateSchema = z.object({ id, key: dateKey, status: z.enum(["pending", "met", "waived", "extended"]), date: isoDate.optional() });

export async function setKeyDate(input: z.input<typeof dateSchema>) {
  return guarded(null, async (user) => {
    const v = dateSchema.parse(input);
    const pa = await db.purchaseAgreement.findFirst({ where: { id: v.id, deletedAt: null, state: "active" }, include: { file: { include: { person: { select: { name: true } } } } } });
    if (!pa) throw new UserError("That contract is no longer active.");
    const status = obj(pa.dateStatus), orig = obj(pa.originalDates);
    const before = pa[v.key] ? isoFromDate(pa[v.key]!) : null;
    let date = before;
    if (v.status === "extended") {
      if (!v.date) throw new UserError("Pick the new date.");
      if (before && before !== v.date) orig[v.key] = orig[v.key] ?? before;
      date = v.date;
    } else if (v.date) date = v.date;
    status[v.key] = v.status as DateStatus;
    await db.$transaction(async (tx) => {
      await tx.purchaseAgreement.update({ where: { id: pa.id }, data: { [v.key]: date ? dateFromIso(date) : null, dateStatus: status, originalDates: orig } });
      await redateContract(tx, pa.id);
      if (v.status === "waived") await closeStepsForWaived(tx, pa.id, v.key);
    });
    await logActivity(user.id, "update", "purchaseAgreement", pa.id, `${label(v.key)} for ${pa.file.person.name}: ${v.status}${date ? ` (${date})` : ""}`);
    await syncContract(pa.id);
    await syncSalesRow(pa.id, "changed"); // owner's sales Google Sheet, when set up
    refresh(pa.file.personId);
  });
}

// ---------- Mark closed / Fell through ----------
export async function markClosed(paId: string) {
  return guarded(null, async (user) => {
    const pa = await db.purchaseAgreement.findFirst({ where: { id: id.parse(paId), deletedAt: null, state: "active" }, include: { file: { include: { person: true } } } });
    if (!pa) throw new UserError("That contract is no longer active.");
    const today = todayCentral();
    const closedOn = pa.closing && pa.closing <= today ? pa.closing : today;
    const pastClient = await db.stage.findFirst({ where: { name: { equals: "Past Client", mode: "insensitive" } } });
    await db.$transaction(async (tx) => {
      await tx.purchaseAgreement.update({ where: { id: pa.id }, data: { state: "closed", endedOn: closedOn, closing: closedOn, dateStatus: { ...obj(pa.dateStatus), closing: "met" } } });
      await tx.clientFile.update({ where: { id: pa.fileId }, data: { closedAt: new Date() } });
      if (pastClient) await tx.person.update({ where: { id: pa.file.personId }, data: { stageId: pastClient.id } });
      // Buyers get a homeiversary on the close date (SPEC.md §6.1).
      if (pa.side === "buyer") {
        await tx.importantDate.deleteMany({ where: { personId: pa.file.personId, kind: "homeiversary" } });
        await tx.importantDate.create({ data: { personId: pa.file.personId, kind: "homeiversary", date: closedOn } });
      }
      // The contract's own open steps are done; the post-close template starts.
      await tx.task.updateMany({ where: { paId: pa.id, completedAt: null, deletedAt: null }, data: { completedAt: new Date() } });
      // Post-close tasks belong to the person, not the closed file, so they stay visible.
      await runTrigger(tx, `closed:${pa.side}`, { personId: pa.file.personId, fileId: null, paId: null, start: isoFromDate(closedOn), dates: contractAnchors(pa), facts: factsOf(pa.answers, pa.writtenStatementNA) }, user.id);
    });
    await logActivity(user.id, "update", "purchaseAgreement", pa.id, `Marked closed: ${pa.address} for ${pa.file.person.name}`);
    await syncContract(pa.id);
    refresh(pa.file.personId);
    revalidatePath("/people");
  });
}

export async function fellThrough(paId: string) {
  return guarded(null, async (user) => {
    const pa = await db.purchaseAgreement.findFirst({ where: { id: id.parse(paId), deletedAt: null, state: "active" }, include: { file: { include: { person: { select: { name: true } } } } } });
    if (!pa) throw new UserError("That contract is no longer active.");
    // The file goes back to the status it had before the contract (it never changed).
    await db.$transaction([
      db.purchaseAgreement.update({ where: { id: pa.id }, data: { state: "fell_through", endedOn: todayCentral() } }),
      // Its open checklist steps no longer apply.
      db.task.updateMany({ where: { paId: pa.id, completedAt: null, deletedAt: null }, data: { deletedAt: new Date() } }),
    ]);
    await logActivity(user.id, "update", "purchaseAgreement", pa.id, `Fell through: ${pa.address} for ${pa.file.person.name}`);
    await syncContract(pa.id);
    await syncSalesRow(pa.id, "ended"); // owner's sales Google Sheet, when set up
    refresh(pa.file.personId);
  });
}

// ---------- Admin → Purchase agreement forms ----------
const fieldSchema = z.object({
  key: z.string().regex(/^[A-Za-z][\w]{0,40}$/), label: z.string().trim().max(80),
  type: z.enum(["text", "money", "number", "pct", "date", "date-na", "datetime", "yesno", "choice", "client", "moneypct"]),
  hint: z.string().trim().max(120).optional(), required: z.boolean().optional(), options: z.array(z.string().trim().min(1).max(60)).max(30).optional(), showIf: z.string().max(120).optional(),
});
const sectionSchema = z.object({ id: z.string().regex(/^[\w-]{1,40}$/), name: z.string().trim().max(80), showIf: z.string().max(120).optional(), people: z.boolean().optional(), fields: z.array(fieldSchema).max(60) });

export async function saveForm(input: { side: string; sections: unknown }) {
  return guarded("manageUsers", async (user) => {
    const side = sideSchema.parse(input.side);
    const sections = z.array(sectionSchema).min(1).max(30).parse(input.sections).map((s) => ({
      ...s, showIf: s.showIf || undefined,
      fields: s.fields.map((f) => ({ ...f, showIf: f.showIf || undefined, hint: f.hint || undefined, required: f.required || undefined, options: f.type === "choice" ? f.options : undefined })),
    }));
    const problem = formProblem(sections);
    if (problem) throw new UserError(problem);
    await db.paForm.upsert({ where: { side }, update: { sections }, create: { side, sections } });
    await logActivity(user.id, "update", "paForm", side, `Saved the ${side}-side purchase agreement form (${sections.length} sections)`);
    revalidatePath("/admin/forms");
  });
}
