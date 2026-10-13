"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { guarded } from "@/server/safe";
import { logActivity } from "@/server/activity";

/** Delete a file from the Files card (to Trash; an Admin can restore it for 30 days). */
export async function deleteDocument(id: string) {
  return guarded(null, async (user) => {
    const d = await db.document.update({ where: { id: z.string().min(1).max(40).parse(id), deletedAt: null }, data: { deletedAt: new Date() }, include: { person: { select: { name: true } } } });
    await logActivity(user.id, "delete", "document", d.id, `Moved "${d.name}" (${d.person.name}) to Trash`);
    revalidatePath(`/people/${d.personId}`);
  });
}
