"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guarded, UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { saveDigestSettings, sendDigest } from "@/server/deadlineDigest";
import { cleanDigest, REPORTS, type ReportKind } from "@/lib/deadlineDigest";

const kindOf = (k: string) => { const r = REPORTS.find((x) => x.kind === k); if (!r) throw new UserError("Unknown report."); return r; };

const schema = z.object({
  on: z.boolean(), day: z.number().int().min(0).max(6), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a time"),
  from: z.string().max(40), to: z.array(z.string().trim().email("One of the email addresses isn't right")).max(10),
});

/** Saves one weekly email's settings (owner requests 2026-11-04). */
export async function saveDeadlineEmail(kind: ReportKind, input: z.input<typeof schema>) {
  return guarded("manageUsers", async (user) => {
    const r = kindOf(kind);
    const s = cleanDigest(schema.parse(input));
    await saveDigestSettings(s, r.kind);
    await logActivity(user.id, "update", "setting", null, `Weekly ${r.name.toLowerCase()} email: ${s.on ? "on" : "off"}`);
    revalidatePath("/admin/weekly-emails");
  });
}

/** Sends it now to the person asking, to check it. */
export async function testDeadlineEmail(kind: ReportKind, input: z.input<typeof schema>) {
  return guarded("manageUsers", async (user) => {
    const r = await sendDigest(cleanDigest(schema.parse(input)), [user.email], kindOf(kind).kind);
    if (!r.ok) throw new UserError(r.error);
    return { to: user.email };
  });
}
