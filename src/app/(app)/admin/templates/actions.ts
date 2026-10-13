"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { guarded, UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { templateProblem, type Template } from "@/lib/templates";

const FIXED_TRIGGERS = ["pa:buyer", "pa:seller", "closed:buyer", "closed:seller", "phonecall"];
const tags = z.array(z.string().trim().min(1).max(60)).max(20).optional();
const stepSchema = z.object({
  id: z.string().regex(/^[\w-]{1,40}$/), name: z.string().trim().max(160), assignee: z.string().trim().max(40),
  type: z.enum(["task", "call", "text", "email", "tags"]), days: z.number().int().min(0).max(730),
  dir: z.enum(["before", "on", "after", "none"]),
  anchor: z.enum(["start", "phoneCall", "finalAcceptance", "inspection", "writtenStatement", "hoaRescission", "closing"]),
  cond: z.enum(["always", "hoa", "pre1978", "newc", "fhava", "condo"]),
  advance: z.string().max(40).optional(), message: z.string().trim().max(120).optional(), messageId: z.string().max(40).optional(), addTags: tags, removeTags: tags,
});
const templateSchema = z.object({
  id: z.string().max(40).nullable(), name: z.string().trim().max(120), trigger: z.string().max(60).nullable(), folder: z.string().trim().max(60).default(""),
  phases: z.array(z.object({ id: z.string().regex(/^[\w-]{1,40}$/), name: z.string().trim().max(120), steps: z.array(stepSchema).max(80) })).max(30),
});

async function checkTrigger(trigger: string | null) {
  if (!trigger || FIXED_TRIGGERS.includes(trigger)) return;
  if (trigger.startsWith("status:") && (await db.pipelineStatus.findFirst({ where: { id: trigger.slice(7), kind: { in: ["buyer", "listing"] } } }))) return;
  throw new UserError("That trigger isn't available anymore. Pick another.");
}

export async function saveTemplate(input: z.input<typeof templateSchema>) {
  return guarded("editTaskTemplates", async (user) => {
    const v = templateSchema.parse(input);
    const t: Template = { id: v.id ?? "", name: v.name, trigger: v.trigger || null, phases: v.phases.map((p) => ({ ...p, steps: p.steps.map((s) => ({ ...s, advance: s.advance || undefined, message: s.messageId ? undefined : s.message || undefined, messageId: s.messageId || undefined })) })) };
    const problem = templateProblem(t);
    if (problem) throw new UserError(problem);
    await checkTrigger(t.trigger);
    const data = { name: t.name, trigger: t.trigger, folder: v.folder, phases: t.phases };
    const saved = v.id
      ? await db.taskTemplate.update({ where: { id: v.id }, data })
      : await db.taskTemplate.create({ data: { ...data, position: ((await db.taskTemplate.aggregate({ _max: { position: true } }))._max.position ?? 0) + 1 } });
    const steps = t.phases.reduce((n, p) => n + p.steps.length, 0);
    await logActivity(user.id, v.id ? "update" : "create", "taskTemplate", saved.id, `${v.id ? "Saved" : "Created"} task template "${t.name}" (${steps} steps)`);
    revalidatePath("/admin/templates");
    return { id: saved.id };
  });
}

export async function duplicateTemplate(id: string) {
  return guarded("editTaskTemplates", async (user) => {
    const t = await db.taskTemplate.findUnique({ where: { id: z.string().max(40).parse(id) } });
    if (!t) throw new UserError("That template was deleted.");
    // The copy starts by hand so two templates don't both fire.
    const copy = await db.taskTemplate.create({ data: { name: `${t.name} (copy)`, trigger: null, folder: t.folder, phases: t.phases ?? [], position: t.position + 1 } });
    await logActivity(user.id, "create", "taskTemplate", copy.id, `Duplicated task template "${t.name}"`);
    revalidatePath("/admin/templates");
    return { id: copy.id };
  });
}

export async function deleteTemplate(id: string) {
  return guarded("editTaskTemplates", async (user) => {
    const t = await db.taskTemplate.delete({ where: { id: z.string().max(40).parse(id) } });
    await logActivity(user.id, "delete", "taskTemplate", t.id, `Deleted task template "${t.name}" (tasks it already made are kept)`);
    revalidatePath("/admin/templates");
  });
}
