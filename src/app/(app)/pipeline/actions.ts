"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { guarded, UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { hasPermission } from "@/server/permissions";
import { cleanAnswers, groupsFor, type FileKind } from "@/lib/files";
import { isoFromDate, todayCentral } from "@/lib/normalize";

const id = z.string().trim().min(1).max(40);
const kindSchema = z.enum(["buyer", "listing"]);
const answersSchema = z.record(z.string(), z.string().max(500));

function refresh(personId: string) {
  revalidatePath(`/people/${personId}`);
  revalidatePath("/pipeline");
}

async function statusIn(kind: FileKind, statusId: string) {
  const all = await db.pipelineStatus.findMany({ where: { kind }, orderBy: { position: "asc" } });
  const i = all.findIndex((s) => s.id === statusId);
  if (i < 0) throw new UserError("That status was removed. Refresh the page.");
  return { status: all[i], index: i, count: all.length };
}

function clean(kind: FileKind, answers: Record<string, string>, index: number, count: number) {
  const required = groupsFor(kind, index, count).flatMap((g) => g.questions).filter((x) => x.required);
  try { return cleanAnswers(kind, answers, required); } catch (e) { throw new UserError((e as Error).message); }
}

// ---------- Start a buyer / listing ----------
const startSchema = z.object({ personId: id, kind: kindSchema, statusId: id, answers: answersSchema });

export async function startFile(input: z.input<typeof startSchema>) {
  return guarded(null, async (user) => {
    const v = startSchema.parse(input);
    const person = await db.person.findFirst({ where: { id: v.personId, deletedAt: null }, select: { id: true, name: true } });
    if (!person) throw new UserError("That person was deleted.");
    const { status, index, count } = await statusIn(v.kind, v.statusId);
    const c = clean(v.kind, v.answers, index, count);
    const canComm = hasPermission(user.permissions, "seeCommissions");
    if (v.kind === "listing" && status.name === "Active" && !c.info.active) c.info.active = isoFromDate(todayCentral());
    const tagName = v.kind === "buyer" ? "Buyer" : "Seller";
    const file = await db.$transaction(async (tx) => {
      const f = await tx.clientFile.create({
        data: { personId: v.personId, kind: v.kind, statusId: status.id, address: c.address, price: c.price, info: c.info, createdById: user.id,
          ...(canComm && (c.commission.commission || c.commission.bac) ? { commission: { create: c.commission } } : {}) },
      });
      // Starting a file tags the person Buyer or Seller (closing removes it, SPEC.md §8).
      const tag = await tx.tag.upsert({ where: { name: tagName }, update: {}, create: { name: tagName } });
      await tx.personTag.upsert({ where: { personId_tagId: { personId: v.personId, tagId: tag.id } }, update: {}, create: { personId: v.personId, tagId: tag.id } });
      return f;
    });
    await logActivity(user.id, "create", "clientFile", file.id, `Started a ${v.kind} for ${person.name} at ${status.name}`);
    refresh(v.personId);
    return { id: file.id };
  });
}

// ---------- Edit ----------
const editSchema = z.object({ id, statusId: id, answers: answersSchema });

export async function updateFile(input: z.input<typeof editSchema>) {
  return guarded(null, async (user) => {
    const v = editSchema.parse(input);
    const f = await db.clientFile.findFirst({ where: { id: v.id, deletedAt: null }, include: { person: { select: { name: true } } } });
    if (!f) throw new UserError("That file was deleted.");
    const kind = f.kind as FileKind;
    const { status, index, count } = await statusIn(kind, v.statusId);
    const c = clean(kind, v.answers, index, count);
    // Keep answers to questions not shown at this status (e.g. the consult date after the consult).
    const shown = new Set(groupsFor(kind, index, count).flatMap((g) => g.questions.map((x) => x.key)));
    const prev = (f.info && typeof f.info === "object" ? f.info : {}) as Record<string, string>;
    const info = { ...Object.fromEntries(Object.entries(prev).filter(([k]) => !shown.has(k))), ...c.info };
    if (kind === "listing" && status.name === "Active" && !info.active) info.active = isoFromDate(todayCentral());
    const canComm = hasPermission(user.permissions, "seeCommissions");
    await db.$transaction(async (tx) => {
      await tx.clientFile.update({
        where: { id: f.id },
        data: {
          info, statusId: status.id, ...(status.id !== f.statusId ? { statusSince: new Date() } : {}),
          ...(shown.has("address") ? { address: c.address } : {}), ...(shown.has("price") ? { price: c.price } : {}),
        },
      });
      // Without "See commissions" the commission fields are never shown, so leave them alone.
      if (canComm && (shown.has("commission") || shown.has("bac"))) {
        const data = { ...(shown.has("commission") ? { commission: c.commission.commission } : {}), ...(shown.has("bac") ? { bac: c.commission.bac } : {}) };
        await tx.fileCommission.upsert({ where: { fileId: f.id }, update: data, create: { fileId: f.id, ...data } });
      }
    });
    await logActivity(user.id, "update", "clientFile", f.id, `Updated ${f.person.name}'s ${kind}${status.id !== f.statusId ? ` (status → ${status.name})` : ""}`);
    refresh(f.personId);
  });
}

// ---------- Status dropdown ----------
export async function setFileStatus(input: { id: string; statusId: string }) {
  return guarded(null, async (user) => {
    const f = await db.clientFile.findFirst({ where: { id: id.parse(input.id), deletedAt: null, closedAt: null }, include: { person: { select: { name: true } }, status: true } });
    if (!f) throw new UserError("That file was closed or deleted.");
    const { status } = await statusIn(f.kind as FileKind, id.parse(input.statusId));
    if (status.id === f.statusId) return { name: status.name };
    const info = { ...((f.info && typeof f.info === "object" ? f.info : {}) as Record<string, string>) };
    if (f.kind === "listing" && status.name === "Active" && !info.active) info.active = isoFromDate(todayCentral());
    await db.clientFile.update({ where: { id: f.id }, data: { statusId: status.id, statusSince: new Date(), info } });
    await logActivity(user.id, "update", "clientFile", f.id, `Moved ${f.person.name}'s ${f.kind} from ${f.status?.name ?? "no status"} to ${status.name}`);
    refresh(f.personId);
    return { name: status.name };
  });
}

// ---------- Delete (to Trash) ----------
export async function deleteFile(fileId: string) {
  return guarded("deleteRecords", async (user) => {
    const f = await db.clientFile.update({ where: { id: id.parse(fileId), deletedAt: null }, data: { deletedAt: new Date() }, include: { person: { select: { name: true } } } });
    await logActivity(user.id, "delete", "clientFile", f.id, `Moved ${f.person.name}'s ${f.kind} to Trash`);
    refresh(f.personId);
  });
}

// ---------- Edit stages (Pipeline board and Admin → Client statuses) ----------
const UNTIL = ["inspection", "hoaRescission", "writtenStatement", "closing"] as const;
const stagesSchema = z.object({
  kind: z.enum(["buyer", "listing", "uc"]),
  rows: z.array(z.object({ id: id.nullable(), name: z.string().trim().min(1, "Stages need a name").max(60), untilDate: z.enum(UNTIL).nullable() })).min(1, "Keep at least one stage").max(20),
});

export async function saveStages(input: z.input<typeof stagesSchema>) {
  return guarded("manageUsers", async (user) => {
    const v = stagesSchema.parse(input);
    const names = v.rows.map((r) => r.name.toLowerCase());
    if (new Set(names).size !== names.length) throw new UserError("Two stages have the same name. Rename one first.");
    if (v.kind === "uc" && v.rows.some((r) => !r.untilDate)) throw new UserError("Pick the date each Under Contract column waits for.");
    const existing = await db.pipelineStatus.findMany({ where: { kind: v.kind }, include: { _count: { select: { files: { where: { deletedAt: null, closedAt: null } } } } } });
    const keep = new Set(v.rows.map((r) => r.id).filter(Boolean));
    for (const gone of existing.filter((e) => !keep.has(e.id))) {
      const n = gone._count.files;
      if (n) throw new UserError(`${n} client${n === 1 ? " is" : "s are"} in "${gone.name}". Move them first.`);
    }
    await db.$transaction(async (tx) => {
      const removed = existing.filter((e) => !keep.has(e.id)).map((e) => e.id);
      if (removed.length) {
        await tx.clientFile.updateMany({ where: { statusId: { in: removed } }, data: { statusId: null } }); // closed/trashed files keep working
        await tx.pipelineStatus.deleteMany({ where: { id: { in: removed } } });
      }
      for (const r of v.rows) if (r.id) await tx.pipelineStatus.update({ where: { id: r.id }, data: { name: `__${r.id}` } });
      for (const [position, r] of v.rows.entries()) {
        const data = { name: r.name, position, untilDate: v.kind === "uc" ? r.untilDate : null };
        if (r.id && existing.some((e) => e.id === r.id)) await tx.pipelineStatus.update({ where: { id: r.id }, data });
        else await tx.pipelineStatus.create({ data: { ...data, kind: v.kind } });
      }
    });
    const label = { buyer: "Buyer Pipeline", listing: "Seller Pipeline", uc: "Under Contract/Pending Pipeline" }[v.kind];
    await logActivity(user.id, "update", "pipelineStatus", null, `Saved ${label}: ${v.rows.map((r) => r.name).join(", ")}`);
    revalidatePath("/pipeline"); revalidatePath("/admin/statuses");
  });
}
