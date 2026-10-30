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
  if (opts.once && ctxIn.fileId) {
    const already = await tx.task.findFirst({ where: { templateId: t.id, fileId: ctxIn.fileId, ...(ctxIn.paId ? { paId: ctxIn.paId } : {}) }, select: { id: true } });
    if (already) return 0;
  }
  const { ctx, who, specs } = await prepare(tx, t, ctxIn, userId);
  let n = 0;
  for (const spec of specs) {
    const s = spec.step;
    if (s.type === "tags") { await applyTags(tx, ctx.personId, s.addTags ?? [], s.removeTags ?? []); continue; }
    if (s.type === "stage") { await applyStage(tx, ctx.personId, s.stage ?? "", t.name); continue; }
    await tx.task.create({ data: { ...stepData(t, spec, ctx, who), personId: ctx.personId, fileId: ctx.fileId ?? null, paId: ctx.paId ?? null, templateId: t.id, stepId: s.id, createdById: userId } });
    n++;
  }
  return n;
}

type Spec = ReturnType<typeof expand>["tasks"][number];

/** Who each step goes to, the consult date for steps timed from it, and the steps that apply (with due dates). */
async function prepare(tx: Tx, t: Template, ctxIn: Ctx, userId: string) {
  let ctx = ctxIn;
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
  return { ctx, who, specs: expand(t, { start: ctx.start, ...ctx.dates }, ctx.facts ?? {}).tasks };
}

/** A step's task fields: title, kind, phase, timing, due date/time, assignee, "when done" and automatic send. */
function stepData(t: Template, spec: Spec, ctx: Ctx, who: (first: string) => string) {
  const s = spec.step;
  // A step set to send by itself goes out at its chosen time on the due date (owner request 2026-10-29).
  // Kept even while the step waits for its date, so "Update the deals" doesn't turn it off for lack of one.
  const auto = (s.type === "text" || s.type === "email") && s.auto ? s.auto : null;
  const autoTime = auto && spec.due && minutesOffset(s) == null ? auto.time : null;
  return {
    autoSend: auto ?? undefined, autoState: auto && spec.due ? "pending" : null,
    // "Ask by text": the assignee gets a text at its due time; replying YES checks it off (owner request 2026-10-30).
    askState: (s.type === "task" || s.type === "call") && s.ask && spec.due ? "pending" : null,
    askKind: (s.type === "task" || s.type === "call") && s.ask ? (s.ask === "consult" ? "consult" : "done") : null, // kept while it waits for its date
    title: s.name, kind: s.type, phase: spec.phase, anchor: s.dir === "none" ? null : s.anchor, offsetDays: s.dir === "none" ? null : offsetOf(s),
    dueDate: spec.due ? dateFromIso(spec.due) : null, dueTime: !spec.due ? null : autoTime ? autoTime : minutesOffset(s) != null ? (ctx.times?.[s.anchor] ? timeBefore(ctx.times[s.anchor]!, minutesOffset(s)!) : null) : offsetOf(s) === 0 ? ctx.times?.[s.anchor] ?? null : null,
    offsetMinutes: minutesOffset(s), // positive = before, negative = after
    assigneeId: who(s.assignee), advanceStatusId: s.advance || null,
  };
}

/**
 * "Update the deals already using it" (owner request 2026-10-29): after a checklist is edited, every place it already
 * started (each person/deal/contract with open steps from it) is brought in line. Open steps get the new name, timing,
 * assignee, message and automatic send; new steps are added; steps removed (or whose "Only when" no longer fits) go to
 * Trash. Done steps, steps someone deleted, and tag/stage steps are left alone. Returns what changed.
 */
export async function syncTemplateToOpen(t: Template, userId: string): Promise<{ deals: number; updated: number; added: number; removed: number }> {
  const out = { deals: 0, updated: 0, added: 0, removed: 0 };
  const open = await db.task.findMany({ where: { templateId: t.id, completedAt: null, deletedAt: null, personId: { not: null }, person: { deletedAt: null } }, select: { personId: true, fileId: true, paId: true } });
  const groups = [...new Map(open.map((g) => [`${g.personId}|${g.fileId ?? ""}|${g.paId ?? ""}`, g])).values()];
  const stepIds = new Set(t.phases.flatMap((p) => p.steps.map((x) => x.id)));
  for (const g of groups) {
    await db.$transaction(async (tx) => {
      const where = { templateId: t.id, personId: g.personId!, fileId: g.fileId, paId: g.paId };
      const all = await tx.task.findMany({ where, orderBy: { createdAt: "asc" } });
      if (g.fileId && !(await tx.clientFile.findFirst({ where: { id: g.fileId, deletedAt: null, closedAt: null }, select: { id: true } }))) return;
      const pa = g.paId ? await tx.purchaseAgreement.findUnique({ where: { id: g.paId } }) : null;
      const file = !pa && g.fileId ? await tx.clientFile.findUnique({ where: { id: g.fileId }, select: { info: true } }) : null;
      const call = t.phases.some((p) => p.steps.some((x) => x.anchor === "phoneCall"))
        ? await tx.appointment.findFirst({ where: { personId: g.personId!, type: "call", deletedAt: null }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }) : null;
      const ctxIn: Ctx = {
        personId: g.personId!, fileId: g.fileId, paId: g.paId,
        start: isoFromDate(todayCentral(all[0]?.createdAt ?? new Date())), // the day this checklist started for them
        dates: { ...(pa ? contractAnchors(pa) : {}), ...(call ? { phoneCall: isoFromDate(call.date) } : {}) },
        times: call?.start ? { phoneCall: call.start } : {},
        facts: pa ? factsOf(pa.answers, pa.writtenStatementNA) : file ? factsOf(file.info) : {},
      };
      const { ctx, who, specs } = await prepare(tx, t, ctxIn, userId);
      const applies = new Map(specs.map((x) => [x.step.id, x]));
      let changed = false;
      for (const task of all.filter((x) => !x.completedAt && !x.deletedAt)) {
        const spec = task.stepId ? applies.get(task.stepId) : undefined;
        if (!spec || !stepIds.has(task.stepId!)) {
          // Removed from the checklist, or its "Only when" no longer fits: to Trash (restorable).
          await tx.task.update({ where: { id: task.id }, data: { deletedAt: new Date(), ...(task.autoState === "pending" ? { autoState: "off" } : {}) } });
          out.removed++; changed = true; continue;
        }
        if (spec.step.type === "tags" || spec.step.type === "stage") continue;
        const d = stepData(t, spec, ctx, who);
        // A step already sent, failed or turned off keeps that state unless it stopped being automatic.
        const autoState = !d.autoSend ? (task.autoState === "pending" ? "off" : task.autoState) : task.autoState ? task.autoState : d.autoState ?? (task.dueDate ? "pending" : null); // Turn off sticks (owner 2026-10-30)
        // A date someone set by hand (the step was detached from its timing) and who it's assigned to stay as they are.
        const handDated = !task.anchor && spec.step.dir !== "none";
        // An ask already sent or answered stays that way; a step that stopped asking stops.
        const askState = !d.askKind ? (task.askState === "pending" ? null : task.askState) : task.askState ? task.askState : d.askState ?? (task.dueDate ? "pending" : null);
        const next = { ...d, autoSend: d.autoSend ?? task.autoSend ?? undefined, autoState, askState, assigneeId: task.assigneeId,
          ...(handDated ? { anchor: task.anchor, offsetDays: task.offsetDays, offsetMinutes: task.offsetMinutes, dueDate: task.dueDate, dueTime: task.dueTime } : {}) };
        const same = task.title === next.title && task.kind === next.kind && task.phase === next.phase && task.anchor === next.anchor && task.offsetDays === next.offsetDays && task.offsetMinutes === next.offsetMinutes
          && (task.dueDate?.getTime() ?? null) === (next.dueDate?.getTime() ?? null) && task.dueTime === next.dueTime && task.assigneeId === next.assigneeId && task.advanceStatusId === next.advanceStatusId
          && JSON.stringify(task.autoSend ?? null) === JSON.stringify(next.autoSend ?? null) && task.autoState === next.autoState && task.askState === next.askState && task.askKind === next.askKind;
        if (same) continue;
        await tx.task.update({ where: { id: task.id }, data: { ...next, autoSend: next.autoSend === undefined ? undefined : (next.autoSend as object) } });
        out.updated++; changed = true;
      }
      // New steps: added unless this step was ever on their checklist (done or deleted counts).
      const seen = new Set(all.map((x) => x.stepId));
      for (const spec of specs) {
        if (seen.has(spec.step.id) || spec.step.type === "tags" || spec.step.type === "stage") continue;
        await tx.task.create({ data: { ...stepData(t, spec, ctx, who), personId: ctx.personId, fileId: ctx.fileId ?? null, paId: ctx.paId ?? null, templateId: t.id, stepId: spec.step.id, createdById: userId } });
        out.added++; changed = true;
      }
      if (changed) out.deals++;
    });
  }
  return out;
}

/** How many people/deals currently have open steps from a checklist (for "Update the N open deals"). */
export async function openUses(templateId: string): Promise<number> {
  const rows = await db.task.findMany({ where: { templateId, completedAt: null, deletedAt: null, personId: { not: null }, person: { deletedAt: null } }, select: { personId: true, fileId: true, paId: true }, distinct: ["personId", "fileId", "paId"] });
  return rows.length;
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
    if ((due?.getTime() ?? null) !== (t.dueDate?.getTime() ?? null)) { await tx.task.update({ where: { id: t.id }, data: { dueDate: due, ...autoOn(t, due) } }); moved++; }
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
    await tx.task.update({ where: { id: t.id }, data: { dueDate: due, dueTime: time, ...autoOn(t, due) } });
  }
}

/** An automatic or "ask by text" step that was waiting for its date starts waiting to send once it has one. */
const autoOn = (t: { autoSend: unknown; autoState: string | null; askKind: string | null; askState: string | null }, due: Date | null) => ({
  ...(t.autoSend && !t.autoState && due ? { autoState: "pending" } : {}), ...(t.askKind && !t.askState && due ? { askState: "pending" } : {}) });

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
  let status = await db.pipelineStatus.findUnique({ where: { id: t.advanceStatusId } });
  if (!status) return null;
  // A consult step made before their buyer/seller deal existed moves their open deal of that kind.
  const find = (where: Prisma.ClientFileWhereInput) => db.clientFile.findFirst({
    where: { deletedAt: null, closedAt: null, ...where }, orderBy: { createdAt: "desc" }, include: { contracts: { where: { state: "active", deletedAt: null }, select: { id: true } } },
  });
  const file = t.fileId ? await find({ id: t.fileId }) : (await find({ personId: t.personId!, kind: status.kind })) ?? (await find({ personId: t.personId! }));
  if (!file || file.contracts.length) return null;
  // "Consult complete (buyer or seller)": on the other kind of deal, the stage with the same name.
  const target = status.kind === file.kind ? status
    : await db.pipelineStatus.findFirst({ where: { kind: file.kind, name: { equals: status.name, mode: "insensitive" } } });
  if (!target || file.statusId === target.id) return null;
  status = target;
  await moveFile(file.id, status.id, userId);
  await logActivity(userId, "update", "clientFile", file.id, `Moved to ${status.name} when "${t.title}" was done`);
  return status.name;
}
