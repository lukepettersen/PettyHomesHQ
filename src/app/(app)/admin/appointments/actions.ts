"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { guarded, UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { APPT_TYPES_KEY, cleanApptTypes } from "@/lib/appointments";

/** Admin → Appointment types → Save (owner request 2026-10-27). */
export async function saveApptTypes(input: unknown) {
  return guarded("manageUsers", async (user) => {
    let types;
    try { types = cleanApptTypes(input); } catch (e) { throw new UserError((e as Error).message); }
    await db.appSetting.upsert({ where: { key: APPT_TYPES_KEY }, update: { value: types }, create: { key: APPT_TYPES_KEY, value: types } });
    await logActivity(user.id, "update", "setting", APPT_TYPES_KEY, `Saved appointment types (${types.length})`);
    revalidatePath("/admin/appointments");
  });
}
