"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guarded, UserError } from "@/server/safe";
import { disconnect } from "@/server/mcp";
import { saveSoundPrefs } from "@/server/sounds";

const schema = z.object({ alerts: z.number().min(0).max(200), alarms: z.number().min(0).max(200), calls: z.number().min(0).max(200) });

/** My settings: this person's own sound volumes (anyone signed in; they only change their own). */
export async function saveSounds(input: z.input<typeof schema>) {
  return guarded(null, async (user) => {
    const r = await saveSoundPrefs(user.id, schema.parse(input));
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
