"use server";

import { z } from "zod";
import { guarded } from "@/server/safe";
import { askClaude } from "@/server/assistant";
import { isoFromDate, todayCentral } from "@/lib/normalize";

const askSchema = z.object({ text: z.string().trim().min(1, "Say or type something first").max(2000, "That's a lot at once. Try a shorter request."), personId: z.string().trim().max(40).nullable() });

/** Ask Claude: returns proposed tasks and notes only. Saving goes through createTask / addTimelineEntry. */
export async function askAssistant(input: z.input<typeof askSchema>) {
  return guarded(null, async (user) => {
    const v = askSchema.parse(input);
    return askClaude({ text: v.text, personId: v.personId, me: { id: user.id, name: user.name }, today: isoFromDate(todayCentral()) });
  });
}
