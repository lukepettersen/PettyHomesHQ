"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { guarded, UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { cleanRules } from "@/lib/contractInvites";
import { INVITES_KEY, inviteDateOptions } from "@/server/contractInvites";

/** Admin → Calendar invites → Save. Existing contracts update on the next change or Refresh calendar invites. */
export async function saveInviteRules(input: unknown) {
  return guarded("manageUsers", async (user) => {
    let rules;
    try { rules = cleanRules(input, await inviteDateOptions()); } catch (e) { throw new UserError((e as Error).message); }
    await db.appSetting.upsert({ where: { key: INVITES_KEY }, update: { value: rules }, create: { key: INVITES_KEY, value: rules } });
    await logActivity(user.id, "update", "setting", INVITES_KEY, `Saved calendar invites (${rules.filter((r) => r.on).length} on)`);
    revalidatePath("/admin/calendar");
  });
}
