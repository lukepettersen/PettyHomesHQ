"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { guarded, UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { isConnected } from "@/server/integrations";

/** Admin → Integrations → Texting on/off: pause or resume sending. */
export async function setTexting(on: boolean) {
  return guarded("manageUsers", async (user) => {
    const value = z.boolean().parse(on);
    if (value && !isConnected("texting")) throw new UserError("Add the Twilio keys in Railway first.");
    await db.appSetting.upsert({ where: { key: "texting.enabled" }, update: { value }, create: { key: "texting.enabled", value } });
    await logActivity(user.id, "update", "setting", "texting.enabled", `Texting turned ${value ? "on" : "off"}`);
    revalidatePath("/admin/integrations");
  });
}
