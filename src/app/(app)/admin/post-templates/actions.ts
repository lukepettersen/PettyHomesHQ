"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guarded } from "@/server/safe";
import { savePostTemplates } from "@/server/postTemplates";

/** Admin → Features → Post templates: save the whole list (each is checked again in cleanTemplates). */
export async function savePostTemplatesAction(input: unknown) {
  return guarded("manageUsers", async (user) => {
    const list = z.array(z.record(z.string(), z.unknown())).max(30).parse(input);
    const saved = await savePostTemplates(user.id, list);
    revalidatePath("/admin/post-templates");
    return saved;
  });
}
