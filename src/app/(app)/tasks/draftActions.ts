"use server";

import { z } from "zod";
import { db } from "@/server/db";
import { guarded, UserError } from "@/server/safe";
import { isoFromDate } from "@/lib/normalize";
import { fill, formMergeFields, formValues, mergeValues, type MergeCtx } from "@/lib/merge";
import { hasPermission } from "@/server/permissions";
import { loadMergeForms } from "@/server/merge";
import type { Phase } from "@/lib/templates";

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {});

/**
 * Draft email / Draft text for a task (SPEC.md §8): the step's message template (or the one picked),
 * filled in from the person, their file and active contract. Nothing is sent; the user reviews and sends.
 */
export async function getDraft(input: { taskId: string; templateId?: string | null }) {
  return guarded(null, async (user) => {
    const v = z.object({ taskId: z.string().min(1).max(200), templateId: z.string().max(40).nullable().optional() }).parse(input);
    const task = await db.task.findFirst({ where: { id: v.taskId, deletedAt: null }, include: { person: { include: { emails: { orderBy: { position: "asc" } }, phones: { orderBy: { position: "asc" } } } } } });
    if (!task) throw new UserError("That task was deleted.");
    const kind = task.kind === "text" ? "text" : "email";
    const templates = await db.messageTemplate.findMany({ where: { kind }, orderBy: [{ folder: "asc" }, { name: "asc" }] });

    // The template the checklist step points at, unless another one was picked.
    let chosen = v.templateId ? templates.find((t) => t.id === v.templateId) : undefined;
    let stepMessage: string | null = null;
    if (!v.templateId && task.templateId && task.stepId) {
      const tpl = await db.taskTemplate.findUnique({ where: { id: task.templateId } });
      const step = (Array.isArray(tpl?.phases) ? (tpl!.phases as unknown as Phase[]) : []).flatMap((p) => p.steps).find((s) => s.id === task.stepId);
      chosen = templates.find((t) => t.id === step?.messageId) ?? templates.find((t) => step?.message && t.name.toLowerCase() === step.message.toLowerCase());
      stepMessage = !chosen && step?.message ? step.message : null;
    }

    const p = task.person;
    const ctx: MergeCtx = { personName: p?.name ?? "", mailingName: p?.mailingName };
    // Every form question is a merge field; empty ones are flagged. Commission/BAC only with "See commissions".
    const canComm = hasPermission(user.permissions, "seeCommissions");
    const forms = await loadMergeForms();
    const fields = formMergeFields(forms);
    const extra: Record<string, string> = Object.fromEntries(fields.map((f) => [f.key, ""]));
    if (p) {
      const pa = await db.purchaseAgreement.findFirst({ where: task.paId ? { id: task.paId } : { state: "active", deletedAt: null, file: { personId: p.id, deletedAt: null, ...(task.fileId ? { id: task.fileId } : {}) } }, orderBy: { createdAt: "desc" }, include: { commission: canComm } });
      const file = await db.clientFile.findFirst({ where: pa ? { id: pa.fileId } : { personId: p.id, deletedAt: null, closedAt: null, ...(task.fileId ? { id: task.fileId } : {}) }, orderBy: { createdAt: "desc" }, include: { commission: canComm } });
      const comm = (c: { commission: string; bac: string } | null | undefined): Record<string, string> => (canComm && c ? { commission: c.commission, bac: c.bac } : {});
      if (file) Object.assign(extra, formValues(forms.find((f) => f.group === (file.kind === "listing" ? "Listing file" : "Buyer file"))!.sections,
        { ...obj(file.info), address: file.address ?? "", price: file.price ? String(file.price) : "", ...comm(file.commission) }));
      if (pa) {
        const d = (x: Date | null) => (x ? isoFromDate(x) : "");
        const answers = { ...obj(pa.answers), address: pa.address, price: String(pa.price), ...comm(pa.commission),
          finalAcceptance: d(pa.finalAcceptance), inspection: d(pa.inspection), writtenStatement: d(pa.writtenStatement), hoaRescission: d(pa.hoaRescission), closing: d(pa.closing),
          ...(pa.writtenStatementNA ? { writtenStatement_na: "yes" } : {}) };
        for (const [k, val] of Object.entries(formValues(forms.find((f) => f.group === (pa.side === "seller" ? "Contract (seller side)" : "Contract (buyer side)"))!.sections, answers))) if (val || !extra[k]) extra[k] = val;
      }
      if (pa) {
        const a = obj(pa.answers), d = (x: Date | null) => (x ? isoFromDate(x) : null);
        Object.assign(ctx, { address: pa.address, price: pa.price, inspAppt: a.inspAppt ?? null, lender: a.lenderName ?? null, titleCompany: a.titleCompany ?? null,
          dates: { finalAcceptance: d(pa.finalAcceptance), inspection: d(pa.inspection), writtenStatement: pa.writtenStatementNA ? null : d(pa.writtenStatement), closing: d(pa.closing) } });
      } else if (file) Object.assign(ctx, { address: file.address, price: file.price, lender: obj(file.info).lender ?? null });
    }
    const team = await db.user.findMany({ where: { status: { not: "DISABLED" } }, orderBy: { isOwner: "desc" } });
    ctx.agentName = team.find((t) => t.isOwner)?.name ?? "";
    ctx.assistantName = team.find((t) => !t.isOwner)?.name ?? "";
    ctx.myName = user.name;

    ctx.extra = extra;
    const values = mergeValues(ctx);
    const subject = chosen ? fill(chosen.subject, values) : { text: "", missing: [] };
    const body = chosen ? fill(chosen.body, values) : { text: "", missing: [] };
    return {
      kind, templateId: chosen?.id ?? null, stepMessage,
      templates: templates.map((t) => ({ id: t.id, name: t.folder ? `${t.folder} · ${t.name}` : t.name })),
      to: kind === "email" ? (p?.emails.map((e) => e.address) ?? []) : (p?.phones.map((x) => x.number) ?? []),
      subject: subject.text, body: body.text, missing: [...new Set([...subject.missing, ...body.missing])].map((k) => fields.find((f) => f.key === k)?.label ?? k),
    };
  });
}
