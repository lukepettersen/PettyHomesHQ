"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guarded, UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { saveDigestSettings, sendDigest } from "@/server/deadlineDigest";
import { cleanDigest } from "@/lib/deadlineDigest";

const schema = z.object({
  on: z.boolean(), day: z.number().int().min(0).max(6), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a time"),
  from: z.string().max(40), to: z.array(z.string().trim().email("One of the email addresses isn't right")).max(10),
});

/** Saves the weekly contingency deadlines email's settings (owner request 2026-11-04). */
export async function saveDeadlineEmail(input: z.input<typeof schema>) {
  return guarded("manageUsers", async (user) => {
    const s = cleanDigest(schema.parse(input));
    await saveDigestSettings(s);
    await logActivity(user.id, "update", "setting", null, `Weekly contingency deadlines email: ${s.on ? "on" : "off"}`);
    revalidatePath("/admin/deadline-email");
  });
}

/** Sends it now to the person asking, to check it. */
export async function testDeadlineEmail(input: z.input<typeof schema>) {
  return guarded("manageUsers", async (user) => {
    const r = await sendDigest(cleanDigest(schema.parse(input)), [user.email]);
    if (!r.ok) throw new UserError(r.error);
    return { to: user.email };
  });
}
