"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { guarded, UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { isConnected } from "@/server/integrations";
import { calendarConnection, disconnect, syncContract } from "@/server/google";
import { connectNumber } from "@/server/twilio";
import { applyGroupTexting } from "@/server/groupText";
import { toE164 } from "@/lib/texting";
import { SHEET_KEY } from "@/server/salesSheet";
import { parseSheetLink } from "@/lib/salesSheet";

/** Admin → Integrations → Texting on/off: pause or resume sending. */
export async function setTexting(on: boolean) {
  return guarded("manageUsers", async (user) => {
    const value = z.boolean().parse(on);
    if (value && !isConnected("texting")) throw new UserError("Add the Twilio keys in Railway first.");
    await db.appSetting.upsert({ where: { key: "texting.enabled" }, update: { value }, create: { key: "texting.enabled", value } });
    await logActivity(user.id, "update", "setting", "texting.enabled", `Texting turned ${value ? "on" : "off"}`);
    revalidatePath("/admin/integrations");
  });
}

/** Admin → Integrations → Texting: group texts kept together through Twilio Conversations (owner 2026-10-22). */
export async function setGroupTexting(on: boolean) {
  return guarded("manageUsers", async (user) => {
    const value = z.boolean().parse(on);
    if (!isConnected("texting")) throw new UserError("Add the Twilio keys in Railway first.");
    const problems = await applyGroupTexting(value);
    await db.appSetting.upsert({ where: { key: "texting.groups" }, update: { value }, create: { key: "texting.groups", value } });
    await logActivity(user.id, "update", "setting", "texting.groups", `Group texting turned ${value ? "on" : "off"}`);
    revalidatePath("/admin/integrations");
    return { message: `${value ? "Group texting is on." : "Group texting is off."}${problems.length ? ` (Twilio cleanup didn't finish: ${problems.join(" ")})` : ""}` };
  });
}

/** Admin → Integrations → Texting: record answered calls (callers hear "This call may be recorded" first). */
export async function setRecordCalls(on: boolean) {
  return guarded("manageUsers", async (user) => {
    const value = z.boolean().parse(on);
    await db.appSetting.upsert({ where: { key: "calls.record" }, update: { value }, create: { key: "calls.record", value } });
    await logActivity(user.id, "update", "setting", "calls.record", `Call recording turned ${value ? "on" : "off"}`);
    revalidatePath("/admin/integrations");
  });
}

const lineSchema = z.object({ userId: z.string().trim().min(1).max(40), number: z.string().trim().max(30), forwardTo: z.string().trim().max(30) });

/**
 * Admin → Integrations → Texting: a team member's own Twilio number and the cell their calls ring (empty = missed
 * call only). Saving points the number's texts and calls at HQ in Twilio.
 */
export async function saveTextLine(input: z.input<typeof lineSchema>) {
  return guarded("manageUsers", async (user) => {
    const v = lineSchema.parse(input);
    const number = v.number ? toE164(v.number) : null;
    if (v.number && !number) throw new UserError("The texting number should be a US number, like 952-243-7646.");
    const forwardTo = v.forwardTo ? toE164(v.forwardTo) : null;
    if (v.forwardTo && !forwardTo) throw new UserError("The cell number should be a US number, like 612-555-0101.");
    if (number && forwardTo === number) throw new UserError("Calls can't forward to the same number.");
    const member = await db.user.findUnique({ where: { id: v.userId }, select: { name: true } });
    if (!member) throw new UserError("That team member was removed.");
    if (number && (await db.user.findFirst({ where: { textNumber: number, id: { not: v.userId } } }))) throw new UserError("Another team member already has that number.");
    await db.user.update({ where: { id: v.userId }, data: { textNumber: number, forwardTo } });
    await logActivity(user.id, "update", "user", v.userId, `Texting number for ${member.name}: ${number ?? "none"}${forwardTo ? ", calls forward to their cell" : ", calls go to missed calls"}`);
    revalidatePath("/admin/integrations");
    if (!number) return { message: "Saved." };
    if (!isConnected("texting")) return { message: "Saved, but Twilio isn't connected yet (add the Twilio keys in Railway), so the number wasn't set up in Twilio. Save again once it says Connected." };
    const r = await connectNumber(number);
    return { message: r.ok ? `Saved. ${r.message}` : `Saved, but: ${r.message}` };
  });
}

/** Admin → Integrations → Texting: most texts each number can send in a day (a safety net; owner default 200). */
export async function saveDailyCap(cap: number) {
  return guarded("manageUsers", async (user) => {
    const value = z.number().int("Use a whole number.").min(1, "At least 1.").max(5000, "At most 5,000.").parse(cap);
    await db.appSetting.upsert({ where: { key: "texting.dailyCap" }, update: { value }, create: { key: "texting.dailyCap", value } });
    await logActivity(user.id, "update", "setting", "texting.dailyCap", `Daily text limit set to ${value}`);
    revalidatePath("/admin/integrations");
  });
}

/** Admin → Integrations → Disconnect Google Calendar: revokes HQ's access and forgets the connection. */
export async function disconnectCalendar() {
  return guarded("manageUsers", async (user) => {
    await disconnect();
    await logActivity(user.id, "update", "integration", "google-calendar", "Disconnected Google Calendar");
    revalidatePath("/admin/integrations");
  });
}

/** Admin → Integrations → Refresh calendar invites: re-saves every active contract's events (dates and who is invited). */
export async function refreshCalendar() {
  return guarded("manageUsers", async (user) => {
    if (!(await calendarConnection())) throw new UserError("Google Calendar isn't connected.");
    const active = await db.purchaseAgreement.findMany({ where: { state: "active", deletedAt: null }, select: { id: true } });
    for (const pa of active) await syncContract(pa.id);
    await logActivity(user.id, "update", "integration", "google-calendar", `Refreshed calendar invites for ${active.length} active contracts`);
    return { count: active.length };
  });
}

/** Admin → Integrations → Sales sheet (owner only): which Google Sheet tab gets a row per new contract (owner request 2026-10-28). */
export async function saveSalesSheet(link: string | null) {
  return guarded("manageUsers", async (user) => {
    if (!user.isOwner) throw new UserError("Only Luke can set the sales sheet.");
    if (!link) {
      await db.appSetting.deleteMany({ where: { key: SHEET_KEY } });
      await logActivity(user.id, "update", "integration", "sales-sheet", "Turned off the sales sheet");
    } else {
      const s = parseSheetLink(z.string().trim().max(500).parse(link));
      if (!s) throw new UserError("That isn't a Google Sheets link. Open the tab in Google Sheets and copy the address bar.");
      await db.appSetting.upsert({ where: { key: SHEET_KEY }, update: { value: { link, ...s } }, create: { key: SHEET_KEY, value: { link, ...s } } });
      await logActivity(user.id, "update", "integration", "sales-sheet", "Set the sales sheet");
    }
    revalidatePath("/admin/integrations");
  });
}
