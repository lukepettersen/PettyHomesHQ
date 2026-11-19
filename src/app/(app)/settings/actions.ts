"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guarded, UserError } from "@/server/safe";
import { disconnect } from "@/server/mcp";
import { saveAlertPrefs, saveSoundPrefs } from "@/server/sounds";
import { ALERT_KINDS } from "@/lib/alerts";

const schema = z.object({ alerts: z.number().min(0).max(200), alarms: z.number().min(0).max(200), calls: z.number().min(0).max(200) });

/** My settings: this person's own sound volumes (anyone signed in; they only change their own). */
export async function saveSounds(input: z.input<typeof schema>) {
  return guarded(null, async (user) => {
    const r = await saveSoundPrefs(user.id, schema.parse(input));
    revalidatePath("/", "layout");
    return r;
  });
}

const alertSchema = z.object(Object.fromEntries(ALERT_KINDS.map((k) => [k.key, z.boolean()])) as Record<string, z.ZodBoolean>);

/** My settings: which alerts pop up with a chime for this person (they only change their own). */
export async function saveAlerts(input: Record<string, boolean>) {
  return guarded(null, async (user) => {
    const r = await saveAlertPrefs(user.id, alertSchema.parse(input));
    revalidatePath("/", "layout");
    return r;
  });
}

/** My settings → Claude app: the owner disconnects Claude (every token stops working right away). */
export async function disconnectClaude() {
  return guarded(null, async (user) => {
    if (!user.isOwner) throw new UserError("Only the owner can connect Claude to HQ.");
    await disconnect(user.id);
    revalidatePath("/settings");
  });
}
