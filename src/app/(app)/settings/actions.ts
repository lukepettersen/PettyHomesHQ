"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guarded } from "@/server/safe";
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
