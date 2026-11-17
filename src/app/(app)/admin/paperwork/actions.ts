"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guarded } from "@/server/safe";
import { savePaperConfig } from "@/server/paperwork";
import { cleanConfig } from "@/lib/paperwork";

// Admin → Paperwork steps (SPEC.md §7.5b): steps per form and the owner's own forms.
const schema = z.object({
  steps: z.record(z.string().max(40), z.array(z.object({ text: z.string().max(500), when: z.string().max(40) })).max(40)),
  custom: z.array(z.object({ key: z.string().regex(/^c_[a-z0-9]{4,24}$/), label: z.string().trim().min(1, "Give each form a name.").max(60) })).max(40),
});

export async function savePaperwork(input: z.input<typeof schema>) {
  return guarded("editTaskTemplates", async (user) => {
    const cfg = cleanConfig(schema.parse(input));
    await savePaperConfig(user.id, cfg);
    revalidatePath("/admin/paperwork");
    return cfg;
  });
}
