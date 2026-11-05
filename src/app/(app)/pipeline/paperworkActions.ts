"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guarded } from "@/server/safe";
import { loadPaperConfig, requestPaperwork } from "@/server/paperwork";
import { paperSchema } from "@/lib/paperwork";

// Request paperwork (SPEC.md §7.5b): ask a teammate to write a form up in ClickContracts.
const schema = z.object({ personId: z.string().trim().min(1).max(40), toId: z.string().trim().min(1, "Pick who should write it up.").max(40), request: paperSchema });

export async function submitPaperwork(input: z.input<typeof schema>) {
  return guarded(null, async (user) => {
    const v = schema.parse(input);
    const r = await requestPaperwork(user, v.personId, v.toId, v.request);
    revalidatePath(`/people/${v.personId}`); revalidatePath("/tasks");
    return r;
  });
}

/** The forms (with the owner's own) and their steps, for the Request paperwork pop-up's preview. */
export async function paperworkSetup() {
  return guarded(null, async () => loadPaperConfig());
}
