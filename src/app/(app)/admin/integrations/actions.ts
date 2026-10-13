"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { guarded, UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { isConnected } from "@/server/integrations";
import { disconnect } from "@/server/google";

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

/** Admin → Integrations → Disconnect Google Calendar: revokes HQ's access and forgets the connection. */
export async function disconnectCalendar() {
  return guarded("manageUsers", async (user) => {
    await disconnect();
    await logActivity(user.id, "update", "integration", "google-calendar", "Disconnected Google Calendar");
    revalidatePath("/admin/integrations");
  });
}
