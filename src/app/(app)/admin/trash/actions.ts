"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { guarded } from "@/server/safe";
import { logActivity } from "@/server/activity";

export async function restorePerson(id: string) {
  return guarded("deleteRecords", async (user) => {
    const p = await db.person.update({ where: { id }, data: { deletedAt: null } });
    await logActivity(user.id, "restore", "person", id, `Restored ${p.name} from Trash`);
    revalidatePath("/admin/trash"); revalidatePath("/people");
  });
}

export async function deleteForever(id: string) {
  return guarded("deleteRecords", async (user) => {
    const p = await db.person.delete({ where: { id, deletedAt: { not: null } } });
    await logActivity(user.id, "delete", "person", id, `Permanently deleted ${p.name}`);
    revalidatePath("/admin/trash");
  });
}

export async function restoreTask(id: string) {
  return guarded("deleteRecords", async (user) => {
    const t = await db.task.update({ where: { id, deletedAt: { not: null } }, data: { deletedAt: null } });
    await logActivity(user.id, "restore", "task", id, `Restored task "${t.title}" from Trash`);
    revalidatePath("/admin/trash"); revalidatePath("/tasks");
  });
}

export async function deleteTaskForever(id: string) {
  return guarded("deleteRecords", async (user) => {
    const t = await db.task.delete({ where: { id, deletedAt: { not: null } } });
    await logActivity(user.id, "delete", "task", id, `Permanently deleted task "${t.title}"`);
    revalidatePath("/admin/trash");
  });
}

export async function restoreFile(id: string) {
  return guarded("deleteRecords", async (user) => {
    const f = await db.clientFile.update({ where: { id, deletedAt: { not: null } }, data: { deletedAt: null }, include: { person: { select: { name: true } } } });
    await logActivity(user.id, "restore", "clientFile", id, `Restored ${f.person.name}'s ${f.kind} from Trash`);
    revalidatePath("/admin/trash"); revalidatePath("/pipeline"); revalidatePath(`/people/${f.personId}`);
  });
}

export async function deleteFileForever(id: string) {
  return guarded("deleteRecords", async (user) => {
    const f = await db.clientFile.delete({ where: { id, deletedAt: { not: null } }, include: { person: { select: { name: true } } } });
    await logActivity(user.id, "delete", "clientFile", id, `Permanently deleted ${f.person.name}'s ${f.kind}`);
    revalidatePath("/admin/trash");
  });
}
