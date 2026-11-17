import { db } from "@/server/db";

/** One row per change: who, what, and a short human summary (no sensitive values). */
export async function logActivity(userId: string, action: "create" | "update" | "delete" | "restore" | "sign_in", entity: string, entityId: string | null, summary: string) {
  await db.activityLog.create({ data: { userId, action, entity, entityId, summary: summary.slice(0, 500) } });
}
