import "server-only";
import { db } from "@/server/db";
import { cleanBoard, NOTE_COLORS, placeNew, type BoardItem } from "@/lib/whiteboard";

// The owner's private whiteboard (owner request 2026-11-02), kept in AppSetting "whiteboard:<userId>".
export const boardKey = (userId: string) => `whiteboard:${userId}`;

export async function loadBoard(userId: string): Promise<BoardItem[]> {
  const row = await db.appSetting.findUnique({ where: { key: boardKey(userId) } });
  try { return row ? cleanBoard(row.value) : []; } catch { return []; }
}

const saveItems = (userId: string, items: BoardItem[]) => {
  const clean = cleanBoard(items);
  return db.appSetting.upsert({ where: { key: boardKey(userId) }, create: { key: boardKey(userId), value: clean as object[] }, update: { value: clean as object[] } });
};

/** A sticky note added from outside the board (the text assistant, owner request 2026-11-03): the first open spot near
 *  the top left, in the color asked for (yellow by default). Returns its id, for undo. */
export async function addBoardNote(userId: string, text: string, color = 0): Promise<string> {
  const items = await loadBoard(userId);
  if (items.length >= 300) throw new Error("The whiteboard is full (300 items). Clear some off first.");
  const id = `t${Date.now().toString(36)}`;
  const lines = text.split("\n").length;
  const size = { w: 240, h: Math.min(400, Math.max(160, 70 + lines * 30 + Math.ceil(text.length / 18) * 8)) };
  await saveItems(userId, [...items, { id, kind: "note", text: text.slice(0, 2000), color: NOTE_COLORS[color] ?? NOTE_COLORS[0], ...size, ...placeNew({ left: 0, top: 0 }, items, size) }]);
  return id;
}

/** Takes a note back off the board (undo). */
export async function removeBoardNote(userId: string, id: string): Promise<boolean> {
  const items = await loadBoard(userId);
  if (!items.some((i) => i.id === id)) return false;
  await saveItems(userId, items.filter((i) => i.id !== id));
  return true;
}
