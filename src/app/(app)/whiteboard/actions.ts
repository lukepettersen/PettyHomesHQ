"use server";

import { db } from "@/server/db";
import { guarded, UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { boardKey } from "@/server/whiteboard";
import { cleanBoard } from "@/lib/whiteboard";

/** Saves the owner's whiteboard (it saves itself as they work). Activity is noted at most once an hour. */
export async function saveBoard(items: unknown) {
  return guarded(null, async (user) => {
    if (!user.isOwner) throw new UserError("The whiteboard is only for the owner.");
    const clean = cleanBoard(items);
    await db.appSetting.upsert({ where: { key: boardKey(user.id) }, create: { key: boardKey(user.id), value: clean as object[] }, update: { value: clean as object[] } });
    const recent = await db.activityLog.findFirst({ where: { userId: user.id, entity: "whiteboard", createdAt: { gte: new Date(Date.now() - 3600000) } }, select: { id: true } });
    if (!recent) await logActivity(user.id, "update", "whiteboard", null, `Updated their whiteboard (${clean.length} items)`);
    return { saved: clean.length };
  });
}
