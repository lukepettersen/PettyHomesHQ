"use server";

import { revalidatePath } from "next/cache";
import { guarded } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { rereadGmail } from "@/server/google";

/** Admin → Showing emails → Look again: reads the last 3 days of every connected inbox now (nothing doubles). */
export async function lookAgain() {
  return guarded("manageUsers", async (user) => {
    const n = await rereadGmail(3);
    await logActivity(user.id, "update", "showing", null, `Looked again at the last 3 days of Gmail for showing emails (${n} new emails read)`);
    revalidatePath("/admin/showings");
    return { read: n };
  });
}
