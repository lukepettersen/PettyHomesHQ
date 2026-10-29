import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { logActivity } from "@/server/activity";
import { dateFromIso, isoFromDate, todayCentral } from "@/lib/normalize";
import { CONTRACT_ANCHORS, condMet, expand, minutesOffset, offsetOf, timeBefore, type Anchor, type Facts, type Phase, type Template } from "@/lib/templates";

// Task templates in action (SPEC.md §8): start checklists on triggers, re-date steps when contract
// dates change, and apply "Add/remove tags" steps.

type Tx = Prisma.TransactionClient | typeof db;
export type Ctx = { personId: string; fileId?: string | null; paId?: string | null; start: string; dates?: Partial<Record<Anchor, string | null>>; facts?: Facts;
  /** Time of day for steps on the day of an anchor, e.g. the booked call's time on "Hold phone call" (SPEC.md §17). */
  times?: Partial<Record<Anchor, string | null>> };

const phasesOf = (v: unknown) => (Array.isArray(v) ? (v as Phase[]) : []);

export async function loadTemplates(tx: Tx = db): Promise<Template[]> {
  const rows = await tx.taskTemplate.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }] });
  return rows.map((r) => ({ id: r.id, name: r.name, trigger: r.trigger, folder: r.folder, phases: phasesOf(r.phases) }));
}

/** Starts every template for a trigger. A file only gets each template once. Returns the number of tasks made. */
export async function runTrigger(tx: Tx, trigger: string, ctx: Ctx, userId: string): Promise<number> {
  // "anyconsult" templates start for a buyer or a seller consultation.
  const templates = (await loadTemplates(tx)).filter((t) => t.trigger === trigger || (t.trigger === "anyconsult" && (trigger === "buyerconsult" || trigger === "sellerconsult")));
  let n = 0;
  for (const t of templates) n += await applyTemplate(tx, t, ctx, userId, { once: true });
  return n;
}

/** Creates the template's tasks for a person (and file/contract). Tag steps run right away. */
export async function applyTemplate(tx: Tx, t: Template, ctxIn: Ctx, userId: string, opts: { once?: boolean } = {}): Promise<number> {
  let ctx = ctxIn;
  if (opts.once && ctx.fileId) {
    const already = await tx.task.findFirst({ where: { templateId: t.id, fileId: ctx.fileId, ...(ctx.paId ? { paId: ctx.paId } : {}) }, select: { id: true } });
    if (already) return 0;
  }
  const [team, person] = await Promise.all([
    tx.user.findMany({ where: { status: { not: "DISABLED" } }, select: { id: true, name: true } }),
    tx.person.findUniqueOrThrow({ where: { id: ctx.personId }, select: { assignedToId: true } }),
  ]);
  const who = (first: string) => (first ? team.find((u) => u.name.split(/\s+/)[0].toLowerCase() === first.toLowerCase())?.id : undefined) ?? person.assignedToId ?? userId;
  // Steps timed from the consult use the booked consultation (or the file's consult date).
  if (t.phases.some((p) => p.steps.some((x) => x.anchor === "consult")) && ctx.dates?.consult === undefined) {
    const c = await consultFor(tx, ctx.personId, ctx.fileId ?? null);
    ctx = { ...ctx, dates: { ...ctx.dates, consult: c?.date ?? null }, times: { ...ctx.times, consult: c?.time ?? null } };
  }
  const { tasks } = expand(t, { start: ctx.start, ...ctx.dates }, ctx.facts ?? {});
  let n = 0;
  for (const spec of tasks) {
    const s = spec.step;
    if (s.type === "tags") { await applyTags(tx, ctx.personId, s.addTags ?? [], s.removeTags ?? []); continue; }
    if (s.type === "stage") { await applyStage(tx, ctx.personId, s.stage ?? "", t.name); continue; }
    // A step set to send by itself goes out at its chosen time on the due date (owner request 2026-10-29).
    const auto = (s.type === "text" || s.type === "email") && s.auto && spec.due ? s.auto : null;
    const autoTime = auto && minutesOffset(s) == null ? auto.time : null;
    await tx.task.create({
      data: {
        ...(auto ? { autoSend: auto, autoState: "pending" } : {}),
        title: s.name, kind: s.type, personId: ctx.personId, fileId: ctx.fileId ?? null, paId: ctx.paId ?? null,
        templateId: t.id, stepId: s.id, phase: spec.phase, anchor: s.dir === "none" ? null : s.anchor, offsetDays: s.dir === "none" ? null : offsetOf(s),
        dueDate: spec.due ? dateFromIso(spec.due) : null, dueTime: !spec.due ? null : autoTime ? autoTime : minutesOffset(s) != null ? (ctx.times?.[s.anchor] ? timeBefore(ctx.times[s.anchor]!, minutesOffset(s)!) : null) : offsetOf(s) === 0 ? ctx.times?.[s.anchor] ?? null : null,
        offsetMinutes: minutesOffset(s), // positive = before, negative = after
        assigneeId: who(s.assignee), advanceStatusId: s.advance || null, createdById: userId,
      },
    });
    n++;
  }
  return n;
}

/** "Change stage" step: sets the contact's stage (a stage that was renamed or removed is skipped). */
async function applyStage(tx: Tx, personId: string, name: string, template: string) {
  const stage = name ? await tx.stage.findUnique({ where: { name } }) : null;
  if (!stage) return;
  const p = await tx.person.findUnique({ where: { id: personId }, select: { stageId: true } });
  if (p?.stageId === stage.id) return;
  await tx.person.update({ where: { id: personId }, data: { stageId: stage.id } });
  await tx.timelineEntry.create({ data: { personId, kind: "system", body: `Stage changed to ${stage.name} (task template "${template}").` } });
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
    const base = t.anchor === "inspAppt" ? apptDate(pa.answers) : (pa[t.anchor as keyof typeof pa] as Date | null);
    const due = base ? new Date(base.getTime() + (t.offsetDays ?? 0) * 86400000) : null;
    if ((due?.getTime() ?? null) !== (t.dueDate?.getTime() ?? null)) { await tx.task.update({ where: { id: t.id }, data: { dueDate: due } }); moved++; }
  }
  return moved;
}

/** Contract answers changed (owner request 2026-10-29): steps whose "Only when" now fails come off the checklist (to
 *  Trash, if still open), and steps whose condition now holds are added. Only conditions that flipped are touched, so
 *  a step someone deleted by hand isn't brought back by an unrelated edit. */
export async function recheckConditions(tx: Tx, paId: string, before: Facts, userId: string): Promise<{ added: number; removed: number }> {
  const pa = await tx.purchaseAgreement.findUniqueOrThrow({ where: { id: paId }, include: { file: { select: { personId: true } } } });
  const after = factsOf(pa.answers, pa.writtenStatementNA);
  const used = new Set((await tx.task.findMany({ where: { paId, templateId: { not: null } }, select: { templateId: true }, distinct: ["templateId"] })).map((x) => x.templateId));
  const ctx: Ctx = { personId: pa.file.personId, fileId: pa.fileId, paId, start: pa.finalAcceptance ? isoFromDate(pa.finalAcceptance) : isoFromDate(todayCentral()), dates: contractAnchors(pa), facts: after };
  let added = 0, removed = 0;
  for (const t of (await loadTemplates(tx)).filter((x) => used.has(x.id))) {
    for (const ph of t.phases) for (const s of ph.steps) {
      if (!s.cond || s.cond === "always") continue;
      const now = condMet(s.cond, after);
      if (condMet(s.cond, before) === now) continue;
      const mine = { paId, templateId: t.id, stepId: s.id, completedAt: null, deletedAt: null };
      if (!now) {
        await tx.task.updateMany({ where: { ...mine, autoState: { in: ["pending", "failed"] } }, data: { autoState: "off" } });
        removed += (await tx.task.updateMany({ where: mine, data: { deletedAt: new Date() } })).count;
      } else if (!(await tx.task.findFirst({ where: { paId, templateId: t.id, stepId: s.id, deletedAt: null }, select: { id: true } }))) {
        added += await applyTemplate(tx, { ...t, phases: [{ ...ph, steps: [s] }] }, ctx, userId);
      }
    }
  }
  return { added, removed };
}

/** A waived date's open steps are no longer needed. */
export async function closeStepsForWaived(tx: Tx, paId: string, anchor: string) {
  const r = await tx.task.updateMany({ where: { paId, anchor, completedAt: null, deletedAt: null }, data: { completedAt: new Date() } });
  return r.count;
}

/** Facts for "Only when" conditions: a contract's answers, or a listing's property questions. */
export const factsOf = (info: unknown, writtenStatementNA?: boolean): Facts => {
  const o = info && typeof info === "object" ? (info as Record<string, string>) : {};
  return { hoa: o.hoa, year: o.year, newc: o.newc, fin: o.fin, ptype: o.ptype, defect: o.defect, ...(writtenStatementNA === undefined ? {} : { ws: writtenStatementNA ? "No" : "Yes" }) };
};

/** The inspection appointment's day, from the contract's answers ("2026-10-30T09:00"). */
export function apptIso(answers: unknown): string | null {
  const v = answers && typeof answers === "object" ? (answers as Record<string, unknown>).inspAppt : null;
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
}
const apptDate = (answers: unknown) => { const iso = apptIso(answers); return iso ? new Date(`${iso}T00:00:00.000Z`) : null; };

/** Contract dates as anchors for templates. */
export function contractAnchors(pa: { finalAcceptance: Date | null; inspection: Date | null; writtenStatement: Date | null; hoaRescission: Date | null; closing: Date | null; answers?: unknown }) {
  const d = (x: Date | null) => (x ? isoFromDate(x) : null);
  return { finalAcceptance: d(pa.finalAcceptance), inspAppt: apptIso(pa.answers), inspection: d(pa.inspection), writtenStatement: d(pa.writtenStatement), hoaRescission: d(pa.hoaRescission), closing: d(pa.closing) };
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


/**
 * The consult a step can be timed from: the person's latest buyer/seller consultation appointment
 * (matching the file's kind when there is one), else the file's "Consult date" answer.
 */
export async function consultFor(tx: Tx, personId: string, fileId: string | null): Promise<{ date: string; time: string | null } | null> {
  const file = fileId ? await tx.clientFile.findUnique({ where: { id: fileId }, select: { kind: true, info: true } }) : null;
  const types = file ? [file.kind === "listing" ? "seller" : "buyer"] : ["buyer", "seller"];
  const appt = await tx.appointment.findFirst({ where: { personId, deletedAt: null, type: { in: types } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] });
  if (appt) return { date: isoFromDate(appt.date), time: appt.start };
  const info = (file?.info && typeof file.info === "object" ? file.info : {}) as Record<string, string>;
  const v = info.consult;
  return v ? { date: v.slice(0, 10), time: v.length > 10 ? v.slice(11, 16) : null } : null;
}

/** The consult was booked or moved: open steps timed from it get new due dates and times. */
export async function redateConsult(tx: Tx, personId: string) {
  const open = await tx.task.findMany({ where: { personId, anchor: "consult", completedAt: null, deletedAt: null } });
  for (const t of open) {
    const c = await consultFor(tx, personId, t.fileId);
    const due = c ? new Date(dateFromIso(c.date).getTime() + (t.offsetDays ?? 0) * 86400000) : null;
    // An automatic step keeps the send time picked for it (unless it's timed in minutes from the consult).
    const auto = t.autoSend && t.offsetMinutes == null ? (t.autoSend as { time?: string }).time ?? null : null;
    const time = auto ?? (!c?.time ? null : t.offsetMinutes != null ? timeBefore(c.time, t.offsetMinutes) : (t.offsetDays ?? 0) === 0 ? c.time : t.dueTime);
    await tx.task.update({ where: { id: t.id }, data: { dueDate: due, dueTime: time } });
  }
}

/** A consult booked again (owner request 2026-10-29): steps timed from the consult that were already done (or
 *  deleted) start over for the new one; steps timed from the start date don't repeat. Returns tasks made. */
export async function restartConsultSteps(tx: Tx, trigger: "buyerconsult" | "sellerconsult", ctx: Ctx, userId: string): Promise<number> {
  const templates = (await loadTemplates(tx)).filter((t) => t.trigger === trigger || t.trigger === "anyconsult");
  let n = 0;
  for (const t of templates) {
    const mine = { templateId: t.id, personId: ctx.personId, ...(ctx.fileId ? { fileId: ctx.fileId } : {}) };
    if (!(await tx.task.findFirst({ where: mine, select: { id: true } }))) continue; // never started here: runTrigger handles it
    for (const ph of t.phases) for (const s of ph.steps) {
      if (s.anchor !== "consult" || s.dir === "none") continue;
      if (await tx.task.findFirst({ where: { ...mine, stepId: s.id, completedAt: null, deletedAt: null }, select: { id: true } })) continue;
      n += await applyTemplate(tx, { ...t, phases: [{ ...ph, steps: [s] }] }, ctx, userId);
    }
  }
  return n;
}

/** A checklist step marked "When done: move deal to…" moves the file once it's done (SPEC.md §7.1), whether it was
 *  checked off by hand or sent by itself (owner 2026-10-29). Returns the stage it moved to, if any. */
export async function advanceAfterDone(taskId: string, userId: string): Promise<string | null> {
  const t = await db.task.findUnique({ where: { id: taskId }, select: { title: true, fileId: true, personId: true, advanceStatusId: true, completedAt: true } });
  if (!t?.completedAt || !t.advanceStatusId || (!t.fileId && !t.personId)) return null;
  const status = await db.pipelineStatus.findUnique({ where: { id: t.advanceStatusId } });
  if (!status) return null;
  // A consult step made before their buyer/seller deal existed moves their open deal of that kind.
  const file = await db.clientFile.findFirst({
    where: { deletedAt: null, closedAt: null, ...(t.fileId ? { id: t.fileId } : { personId: t.personId!, kind: status.kind }) },
    orderBy: { createdAt: "desc" }, include: { contracts: { where: { state: "active", deletedAt: null }, select: { id: true } } },
  });
  if (!file || file.statusId === status.id || file.contracts.length || status.kind !== file.kind) return null;
  await moveFile(file.id, status.id, userId);
  await logActivity(userId, "update", "clientFile", file.id, `Moved to ${status.name} when "${t.title}" was done`);
  return status.name;
}
