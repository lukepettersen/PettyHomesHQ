"use server";

import { z } from "zod";
import { db } from "@/server/db";
import { guarded, UserError } from "@/server/safe";
import { isoFromDate } from "@/lib/normalize";
import { fill } from "@/lib/merge";
import { mergeFor } from "@/server/merge";
import { emailConnection } from "@/server/google";
import { textComposerFor } from "@/server/texting";
import { TEXT_STOP_TAG } from "@/lib/texting";
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
    const { values, label } = await mergeFor(user, p?.id ?? null, { paId: task.paId, fileId: task.fileId });
    const subject = chosen ? fill(chosen.subject, values) : { text: "", missing: [] };
    const body = chosen ? fill(chosen.body, values) : { text: "", missing: [] };
    return {
      kind, templateId: chosen?.id ?? null, stepMessage,
      templates: templates.map((t) => ({ id: t.id, name: t.folder ? `${t.folder} · ${t.name}` : t.name })),
      to: kind === "email" ? (p?.emails.map((e) => e.address) ?? []) : (p?.phones.map((x) => x.number) ?? []),
      personId: p?.id ?? null,
      sendsFrom: kind === "email" ? (await emailConnection())?.email ?? null : null,
      // Draft text sends from the user's own number when texting is set up (SPEC.md §11).
      textBlocked: kind === "text" ? (await textComposerFor(user, p && (await db.personTag.count({ where: { personId: p.id, tag: { name: TEXT_STOP_TAG } } })) ? p.name : null)).blocked : null,
      subject: subject.text, body: body.text, missing: [...new Set([...subject.missing, ...body.missing])].map(label),
    };
  });
}
