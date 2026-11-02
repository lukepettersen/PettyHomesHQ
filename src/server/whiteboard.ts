import "server-only";
import { db } from "@/server/db";
import { cleanBoard, type BoardItem } from "@/lib/whiteboard";

// The owner's private whiteboard (owner request 2026-11-02), kept in AppSetting "whiteboard:<userId>".
export const boardKey = (userId: string) => `whiteboard:${userId}`;

export async function loadBoard(userId: string): Promise<BoardItem[]> {
  const row = await db.appSetting.findUnique({ where: { key: boardKey(userId) } });
  try { return row ? cleanBoard(row.value) : []; } catch { return []; }
}
