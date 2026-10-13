import "server-only";
import { db } from "@/server/db";

export const TRASH_DAYS = 30;

/** Permanently removes people, tasks and client files that have been in Trash longer than 30 days (their notes, tasks and dates go with them). */
export async function purgeTrash(now = new Date()) {
  const cutoff = new Date(now.getTime() - TRASH_DAYS * 86400000);
  const r = await db.person.deleteMany({ where: { deletedAt: { lt: cutoff } } });
  const t = await db.task.deleteMany({ where: { deletedAt: { lt: cutoff } } });
  const f = await db.clientFile.deleteMany({ where: { deletedAt: { lt: cutoff } } });
  return r.count + t.count + f.count;
}
