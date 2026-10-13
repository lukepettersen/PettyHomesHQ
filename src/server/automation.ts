import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { dateFromIso, isoFromDate, todayCentral } from "@/lib/normalize";
import { CONTRACT_ANCHORS, expand, offsetOf, type Anchor, type Facts, type Phase, type Template } from "@/lib/templates";

// Task templates in action (SPEC.md §8): start checklists on triggers, re-date steps when contract
// dates change, and apply "Add/remove tags" steps.

type Tx = Prisma.TransactionClient | typeof db;
export type Ctx = { personId: string; fileId?: string | null; paId?: string | null; start: string; dates?: Partial<Record<Anchor, string | null>>; facts?: Facts };

const phasesOf = (v: unknown) => (Array.isArray(v) ? (v as Phase[]) : []);

export async function loadTemplates(tx: Tx = db): Promise<Template[]> {
  const rows = await tx.taskTemplate.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }] });
  return rows.map((r) => ({ id: r.id, name: r.name, trigger: r.trigger, phases: phasesOf(r.phases) }));
}

/** Starts every template for a trigger. A file only gets each template once. Returns the number of tasks made. */
export async function runTrigger(tx: Tx, trigger: string, ctx: Ctx, userId: string): Promise<number> {
  const templates = (await loadTemplates(tx)).filter((t) => t.trigger === trigger);
  let n = 0;
  for (const t of templates) n += await applyTemplate(tx, t, ctx, userId, { once: true });
  return n;
}

/** Creates the template's tasks for a person (and file/contract). Tag steps run right away. */
export async function applyTemplate(tx: Tx, t: Template, ctx: Ctx, userId: string, opts: { once?: boolean } = {}): Promise<number> {
  if (opts.once && ctx.fileId) {
    const already = await tx.task.findFirst({ where: { templateId: t.id, fileId: ctx.fileId, ...(ctx.paId ? { paId: ctx.paId } : {}) }, select: { id: true } });
    if (already) return 0;
  }
  const [team, person] = await Promise.all([
    tx.user.findMany({ where: { status: { not: "DISABLED" } }, select: { id: true, name: true } }),
    tx.person.findUniqueOrThrow({ where: { id: ctx.personId }, select: { assignedToId: true } }),
  ]);
  const who = (first: string) => (first ? team.find((u) => u.name.split(/\s+/)[0].toLowerCase() === first.toLowerCase())?.id : undefined) ?? person.assignedToId ?? userId;
  const { tasks } = expand(t, { start: ctx.start, ...ctx.dates }, ctx.facts ?? {});
  let n = 0;
  for (const spec of tasks) {
    const s = spec.step;
    if (s.type === "tags") { await applyTags(tx, ctx.personId, s.addTags ?? [], s.removeTags ?? []); continue; }
    await tx.task.create({
      data: {
        title: s.name, kind: s.type, personId: ctx.personId, fileId: ctx.fileId ?? null, paId: ctx.paId ?? null,
        templateId: t.id, stepId: s.id, phase: spec.phase, anchor: s.dir === "none" ? null : s.anchor, offsetDays: s.dir === "none" ? null : offsetOf(s),
        dueDate: spec.due ? dateFromIso(spec.due) : null, assigneeId: who(s.assignee), advanceStatusId: s.advance || null, createdById: userId,
      },
    });
    n++;
  }
  return n;
}

async function applyTags(tx: Tx, personId: string, add: string[], remove: string[]) {
  for (const name of add) {
    const tag = await tx.tag.upsert({ where: { name }, update: {}, create: { name } });
    await tx.personTag.upsert({ where: { personId_tagId: { personId, tagId: tag.id } }, update: {}, create: { personId, tagId: tag.id } });
  }
  if (remove.length) await tx.personTag.deleteMany({ where: { personId, tag: { name: { in: remove } } } });
}

/** Contract dates moved: open steps timed from them get new due dates (or wait again). */
export async function redateContract(tx: Tx, paId: string) {
  const pa = await tx.purchaseAgreement.findUniqueOrThrow({ where: { id: paId } });
  const open = await tx.task.findMany({ where: { paId, completedAt: null, deletedAt: null, anchor: { in: CONTRACT_ANCHORS } } });
  let moved = 0;
  for (const t of open) {
    const base = pa[t.anchor as keyof typeof pa] as Date | null;
    const due = base ? new Date(base.getTime() + (t.offsetDays ?? 0) * 86400000) : null;
    if ((due?.getTime() ?? null) !== (t.dueDate?.getTime() ?? null)) { await tx.task.update({ where: { id: t.id }, data: { dueDate: due } }); moved++; }
  }
  return moved;
}

/** A waived date's open steps are no longer needed. */
export async function closeStepsForWaived(tx: Tx, paId: string, anchor: string) {
  const r = await tx.task.updateMany({ where: { paId, anchor, completedAt: null, deletedAt: null }, data: { completedAt: new Date() } });
  return r.count;
}

/** Facts for "Only when" conditions: a contract's answers, or a listing's property questions. */
export const factsOf = (info: unknown): Facts => {
  const o = info && typeof info === "object" ? (info as Record<string, string>) : {};
  return { hoa: o.hoa, year: o.year, newc: o.newc, fin: o.fin, ptype: o.ptype };
};

/** Contract dates as anchors for templates. */
export function contractAnchors(pa: { finalAcceptance: Date | null; inspection: Date | null; writtenStatement: Date | null; hoaRescission: Date | null; closing: Date | null }) {
  const d = (x: Date | null) => (x ? isoFromDate(x) : null);
  return { finalAcceptance: d(pa.finalAcceptance), inspection: d(pa.inspection), writtenStatement: d(pa.writtenStatement), hoaRescission: d(pa.hoaRescission), closing: d(pa.closing) };
}

/** Moves a file to a status and starts that status's templates (once per file). */
export async function moveFile(fileId: string, statusId: string, userId: string) {
  return db.$transaction(async (tx) => {
    const f = await tx.clientFile.findUniqueOrThrow({ where: { id: fileId }, include: { status: true } });
    const status = await tx.pipelineStatus.findUniqueOrThrow({ where: { id: statusId } });
    const info = { ...((f.info && typeof f.info === "object" ? f.info : {}) as Record<string, string>) };
    if (f.kind === "listing" && status.name === "Active" && !info.active) info.active = isoFromDate(todayCentral());
    await tx.clientFile.update({ where: { id: f.id }, data: { statusId: status.id, statusSince: new Date(), info } });
    return runTrigger(tx, `status:${status.id}`, { personId: f.personId, fileId: f.id, start: isoFromDate(todayCentral()), facts: factsOf(info) }, userId);
  });
}

