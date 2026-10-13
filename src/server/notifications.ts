import "server-only";
import { db } from "@/server/db";

export type BellItem = { id: string; text: string; personId: string | null; at: string; read: boolean };

/** The signed-in user's latest mentions for the bell. */
export async function loadBell(userId: string): Promise<{ unread: number; items: BellItem[] }> {
  const [unread, items] = await Promise.all([
    db.notification.count({ where: { toId: userId, readAt: null } }),
    db.notification.findMany({ where: { toId: userId }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return { unread, items: items.map((n) => ({ id: n.id, text: n.text, personId: n.personId, at: n.createdAt.toISOString(), read: !!n.readAt })) };
}
