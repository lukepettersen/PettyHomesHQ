"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { UserError } from "@/server/safe";
import { loadSignup, receiveSignup } from "@/server/events";
import { answersProblem, cleanAnswers, signupState } from "@/lib/events";
import { normalizePhone } from "@/lib/normalize";

// The public signup form (no sign-in): the long random link is the only key. Checked again on the server: the page is
// on and open, the answers fit the questions, and nobody sends too many in a row.
const recent = new Map<string, number[]>();
function tooMany(ip: string) {
  const now = Date.now(), list = (recent.get(ip) ?? []).filter((t) => now - t < 10 * 60000);
  list.push(now); recent.set(ip, list);
  if (recent.size > 5000) recent.clear();
  return list.length > 10;
}

const schema = z.object({
  key: z.string().min(20).max(64), first: z.string().trim().min(1, "Please add your first name.").max(60), last: z.string().trim().max(60),
  phone: z.string().trim().max(30), email: z.string().trim().max(200), slotIds: z.array(z.string().max(40)).max(200), answers: z.record(z.string().max(60), z.string().max(1000)),
  website: z.string().max(200).optional(), // a hidden box people never see; robots fill it in
});

export async function submitSignup(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
    const v = parsed.data;
    if (v.website) return { ok: true };
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (tooMany(ip)) return { ok: false, error: "That's a lot of signups at once. Please wait a few minutes and try again." };
    const e = await loadSignup(v.key);
    if (!e) return { ok: false, error: "This signup page isn't available." };
    const state = signupState(e);
    if (!state.open) return { ok: false, error: state.why };
    if (normalizePhone(v.phone).length !== 10) return { ok: false, error: "Please add a 10-digit phone number." };
    if (e.page.email === "required" && !v.email) return { ok: false, error: "Please add your email." };
    if (e.page.email === "off") v.email = "";
    if (v.email && !/^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(v.email)) return { ok: false, error: "That email address doesn't look right." };
    const answers = cleanAnswers(e.fields, v.answers);
    const problem = answersProblem(e.fields, answers);
    if (problem) return { ok: false, error: problem };
    await receiveSignup(e.id, { first: v.first, last: v.last, phone: v.phone, email: v.email, slotIds: v.slotIds, answers });
    return { ok: true };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    console.error("Event signup failed:", e instanceof Error ? e.name : "error");
    return { ok: false, error: "Something went wrong. Please try again, or text Luke at 612-702-0295." };
  }
}
