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
