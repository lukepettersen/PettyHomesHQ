"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { guarded, UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { saveAlertPrefs, saveSoundPrefs } from "@/server/sounds";
import { ALERT_KINDS, testText, type AlertKind } from "@/lib/alerts";
import type { SessionUser } from "@/server/auth";

const schema = z.object({ alerts: z.number().min(0).max(200), alarms: z.number().min(0).max(200), calls: z.number().min(0).max(200) });
const alertSchema = z.object(Object.fromEntries(ALERT_KINDS.map((k) => [k.key, z.boolean()])) as Record<string, z.ZodBoolean>);
const idSchema = z.string().min(1).max(40).optional();

/** Whose settings: your own, or (the owner only, owner request 2026-11-19) a teammate's. */
async function whose(user: SessionUser, forId: unknown): Promise<string> {
  const id = idSchema.parse(forId ?? undefined);
  if (!id || id === user.id) return user.id;
  if (!user.isOwner) throw new UserError("Only the owner can change someone else's settings.");
  const u = await db.user.findFirst({ where: { id, status: { not: "DISABLED" } }, select: { id: true } });
  if (!u) throw new UserError("That teammate can't sign in any more.");
  return u.id;
}

/** My settings: sound volumes (yours, or the owner for a teammate). */
export async function saveSounds(input: z.input<typeof schema>, forId?: string) {
  return guarded(null, async (user) => {
    const id = await whose(user, forId);
    const r = await saveSoundPrefs(id, schema.parse(input), user.id);
    revalidatePath("/", "layout");
    return r;
  });
}

/** My settings: which alerts pop up with a chime (yours, or the owner for a teammate). */
export async function saveAlerts(input: Record<string, boolean>, forId?: string) {
  return guarded(null, async (user) => {
    const id = await whose(user, forId);
    const r = await saveAlertPrefs(id, alertSchema.parse(input), user.id);
    revalidatePath("/", "layout");
    return r;
  });
}

/** Sends a test alert of one kind to yourself (or, the owner, to a teammate): it pops up on their HQ like the real one. */
export async function sendTestAlert(kind: string, forId?: string) {
  return guarded(null, async (user) => {
    const k = z.enum(ALERT_KINDS.map((x) => x.key) as [AlertKind, ...AlertKind[]]).parse(kind);
    const id = await whose(user, forId);
    await db.notification.create({ data: { toId: id, fromId: user.id, alert: true, text: testText(k, user.name.split(" ")[0]) } });
    await logActivity(user.id, "create", "notification", null, `Sent a test alert (${k})${id !== user.id ? " to a teammate" : ""}`);
  });
}
