"use server";

import { z } from "zod";
import { db } from "@/server/db";
import { guarded } from "@/server/safe";

export async function markNotificationRead(id: string) {
  return guarded(null, async (user) => {
    await db.notification.updateMany({ where: { id: z.string().min(1).max(40).parse(id), toId: user.id, readAt: null }, data: { readAt: new Date() } });
  });
}

export async function markAllNotificationsRead() {
  return guarded(null, async (user) => {
    await db.notification.updateMany({ where: { toId: user.id, readAt: null }, data: { readAt: new Date() } });
  });
}
