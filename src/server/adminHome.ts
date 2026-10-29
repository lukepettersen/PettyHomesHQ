import "server-only";
import { db } from "@/server/db";

/** Items in Trash (deleted in the last 30 days and not purged yet): people, deals and tasks. */
export async function trashCount(): Promise<number> {
  const since = new Date(Date.now() - 30 * 86400000);
  const n = await Promise.all([db.person.count({ where: { deletedAt: { gte: since } } }), db.clientFile.count({ where: { deletedAt: { gte: since } } }), db.task.count({ where: { deletedAt: { gte: since } } })]);
  return n.reduce((a, b) => a + b, 0);
}
