// The owner's whiteboard (owner request 2026-11-02): sticky notes, marker text and people's names placed anywhere.
// Pure, so it's unit tested.
import { z } from "zod";

export const NOTE_COLORS = ["#fdf1a8", "#d8ecc8", "#f8d7dd", "#d4e6f5", "#fbe0c4"] as const;
export const BOARD = { w: 2400, h: 1400 };

const itemSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(["note", "text", "person"]),
  x: z.number().finite(), y: z.number().finite(),
  w: z.number().finite().optional(), h: z.number().finite().optional(),
  color: z.string().optional(),
  size: z.number().finite().optional(), // text and names: font size
  align: z.enum(["left", "center", "right"]).optional(), // notes and text (owner request 2026-11-02)
  text: z.string().max(2000).default(""),
  personId: z.string().max(40).optional(),
});
export type BoardItem = z.infer<typeof itemSchema>;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

/** What gets saved: known kinds only, kept on the board, sensible sizes, a picked color. At most 300 items. */
export function cleanBoard(raw: unknown): BoardItem[] {
  const list = z.array(z.unknown()).max(300).parse(raw);
  return list.map((r) => itemSchema.parse(r)).map((i) => ({
    id: i.id, kind: i.kind, text: i.text,
    x: clamp(i.x, 0, BOARD.w - 40), y: clamp(i.y, 0, BOARD.h - 30),
    ...(i.kind === "note" ? { w: clamp(i.w ?? 220, 120, 700), h: clamp(i.h ?? 160, 80, 700), color: NOTE_COLORS.includes(i.color as never) ? i.color : NOTE_COLORS[0] } : {}),
    ...(i.kind !== "note" ? { size: clamp(i.size ?? (i.kind === "text" ? 40 : 30), 16, 120) } : {}),
    // A text box the owner has reshaped keeps its width and height; otherwise it fits its words.
    ...(i.kind === "text" && i.w && i.h ? { w: clamp(i.w, 60, BOARD.w), h: clamp(i.h, 30, BOARD.h) } : {}),
    ...(i.kind !== "person" && i.align && i.align !== "left" ? { align: i.align } : {}),
    ...(i.kind === "person" && i.personId ? { personId: i.personId } : {}),
  }));
}

/** Roughly how much room an item takes (notes have a size; text and names grow with their words). */
export function boxOf(i: Pick<BoardItem, "kind" | "x" | "y" | "w" | "h" | "size" | "text">) {
  if (i.kind === "note") return { x: i.x, y: i.y, w: i.w ?? 220, h: i.h ?? 160 };
  if (i.kind === "text" && i.w && i.h) return { x: i.x, y: i.y, w: i.w, h: i.h };
  const size = i.size ?? 36, lines = (i.text || "Type here").split("\n");
  return { x: i.x, y: i.y, w: Math.max(4, ...lines.map((l) => l.length)) * size * 0.55 + size, h: lines.length * size * 1.3 };
}

/** Where a new item goes: the first open spot in what's on screen (left to right, top to bottom), so new ones don't
 *  land on top of each other; when the screen is full, a little below the last spot. */
export function placeNew(view: { left: number; top: number; w?: number; h?: number }, items: Pick<BoardItem, "kind" | "x" | "y" | "w" | "h" | "size" | "text">[], size = { w: 240, h: 180 }): { x: number; y: number } {
  const boxes = items.map(boxOf);
  const free = (x: number, y: number) => boxes.every((b) => x + size.w <= b.x || b.x + b.w <= x || y + size.h <= b.y || b.y + b.h <= y);
  const cols = Math.max(1, Math.floor(((view.w ?? 1340) - 40) / (size.w + 20))), rows = Math.max(1, Math.floor(((view.h ?? 800) - 40) / (size.h + 20)));
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const x = clamp(view.left + 40 + col * (size.w + 20), 0, BOARD.w - size.w), y = clamp(view.top + 40 + row * (size.h + 20), 0, BOARD.h - size.h);
    if (free(x, y)) return { x, y };
  }
  return { x: clamp(view.left + 60 + (items.length % 6) * 24, 0, BOARD.w - size.w), y: clamp(view.top + 60 + (items.length % 6) * 24, 0, BOARD.h - size.h) };
}
