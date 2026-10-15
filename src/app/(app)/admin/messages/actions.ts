"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { guarded, UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";

const schema = z.object({
  id: z.string().max(40).nullable(),
  kind: z.enum(["email", "text"]),
  name: z.string().trim().min(1, "Give the template a name").max(120),
  folder: z.string().trim().max(40).default(""),
  subject: z.string().trim().max(200).default(""),
  body: z.string().max(10000),
});

export async function saveMessageTemplate(input: z.input<typeof schema>) {
  return guarded("editMessageTemplates", async (user) => {
    const v = schema.parse(input);
    if (!v.body.trim()) throw new UserError("Write the message first.");
    if (v.kind === "email" && !v.subject) throw new UserError("Emails need a subject.");
    const clash = await db.messageTemplate.findFirst({ where: { kind: v.kind, name: { equals: v.name, mode: "insensitive" }, NOT: v.id ? { id: v.id } : undefined } });
    if (clash) throw new UserError(`There's already a ${v.kind} template called "${clash.name}".`);
    const data = { kind: v.kind, name: v.name, folder: v.folder, subject: v.kind === "email" ? v.subject : "", body: v.body };
    const t = v.id ? await db.messageTemplate.update({ where: { id: v.id }, data }) : await db.messageTemplate.create({ data });
    await logActivity(user.id, v.id ? "update" : "create", "messageTemplate", t.id, `${v.id ? "Saved" : "Created"} ${v.kind} template "${t.name}"`);
    revalidatePath("/admin/messages"); revalidatePath("/admin/templates");
    return { id: t.id };
  });
}

export async function deleteMessageTemplate(id: string) {
  return guarded("editMessageTemplates", async (user) => {
    const t = await db.messageTemplate.delete({ where: { id: z.string().min(1).max(40).parse(id) } });
    await logActivity(user.id, "delete", "messageTemplate", t.id, `Deleted ${t.kind} template "${t.name}"`);
    revalidatePath("/admin/messages"); revalidatePath("/admin/templates");
  });
}

const moveSchema = z.object({ id: z.string().min(1).max(40), folder: z.string().trim().max(40) });

/** Dragging a template onto a folder (or "No folder") moves it there. */
export async function moveMessageTemplate(input: z.input<typeof moveSchema>) {
  return guarded("editMessageTemplates", async (user) => {
    const v = moveSchema.parse(input);
    const before = await db.messageTemplate.findUnique({ where: { id: v.id } });
    if (!before) throw new UserError("That template was deleted.");
    if (before.folder === v.folder) return;
    await db.messageTemplate.update({ where: { id: v.id }, data: { folder: v.folder } });
    await logActivity(user.id, "update", "messageTemplate", v.id, `Moved ${before.kind} template "${before.name}" from ${before.folder || "no folder"} to ${v.folder || "no folder"}`);
    revalidatePath("/admin/messages"); revalidatePath("/admin/templates");
  });
}
