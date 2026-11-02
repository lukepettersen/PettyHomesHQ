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
  group: z.string().max(40).optional(), // items grouped for good move and pick together (owner request 2026-11-02)
});
export type BoardItem = z.infer<typeof itemSchema>;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

/** What gets saved: known kinds only, kept on the board, sensible sizes, a picked color. At most 300 items. */
export function cleanBoard(raw: unknown): BoardItem[] {
  const list = z.array(z.unknown()).max(300).parse(raw).map((r) => itemSchema.parse(r));
  const count = new Map<string, number>();
  list.forEach((i) => i.group && count.set(i.group, (count.get(i.group) ?? 0) + 1));
  return list.map((i) => ({
    id: i.id, kind: i.kind, text: i.text,
    x: clamp(i.x, 0, BOARD.w - 40), y: clamp(i.y, 0, BOARD.h - 30),
    ...(i.kind === "note" ? { w: clamp(i.w ?? 220, 120, 700), h: clamp(i.h ?? 160, 80, 700), color: NOTE_COLORS.includes(i.color as never) ? i.color : NOTE_COLORS[0] } : {}),
    ...(i.kind !== "note" ? { size: clamp(i.size ?? (i.kind === "text" ? 40 : 30), 16, 120) } : {}),
    // A text box the owner has reshaped keeps its width and height; otherwise it fits its words.
    ...(i.kind === "text" && i.w && i.h ? { w: clamp(i.w, 60, BOARD.w), h: clamp(i.h, 30, BOARD.h) } : {}),
    ...(i.kind !== "person" && i.align && i.align !== "left" ? { align: i.align } : {}),
    ...(i.kind === "person" && i.personId ? { personId: i.personId } : {}),
    ...(i.group && (count.get(i.group) ?? 0) > 1 ? { group: i.group } : {}), // a group of one is no group
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

/** Bold, italic and underline on the board (owner request 2026-11-02), kept in the text as **bold**, *italic* and
 *  __underline__ so the saved board stays plain words. A marker without its partner shows as typed. */
export type Rich = { t: string; b: boolean; i: boolean; u: boolean };
const MARKS = ["**", "__", "*"] as const;
export function richSegments(text: string): Rich[] {
  const tokens = text.split(/(\*\*|__|\*)/).filter((x) => x !== "");
  const left = new Map<string, number>(MARKS.map((m) => [m, tokens.filter((x) => x === m).length]));
  const out: Rich[] = [];
  const on = { "**": false, "__": false, "*": false } as Record<string, boolean>;
  for (const tok of tokens) {
    if ((MARKS as readonly string[]).includes(tok)) {
      const n = left.get(tok)!; left.set(tok, n - 1);
      // An opening marker with no partner left to close it is just a character.
      if (on[tok] || n >= 2) { on[tok] = !on[tok]; continue; }
    }
    const seg = { t: tok, b: on["**"], i: on["*"], u: on["__"] };
    const last = out[out.length - 1];
    if (last && last.b === seg.b && last.i === seg.i && last.u === seg.u) last.t += tok; else out.push(seg);
  }
  return out;
}
/** The words without the formatting markers (for sizing). */
export const plainText = (text: string) => richSegments(text).map((s) => s.t).join("");
/** Turns a marker on or off around the selected words (or puts a pair at the cursor). Returns the new text and selection.
 *  Spaces and line breaks at the edges of the selection stay outside the markers, and a selection over several lines
 *  marks each line (owner report 2026-11-02: a selected heading plus its line break came out as raw **__). */
export function toggleMark(text: string, start: number, end: number, mark: "**" | "*" | "__") {
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  if (text.slice(start, end).includes("\n")) {
    const out = toggleAll(text.slice(start, end), mark);
    return { text: text.slice(0, start) + out + text.slice(end), start, end: start + out.length };
  }
  const n = mark.length;
  if (start >= n && text.slice(start - n, start) === mark && text.slice(end, end + n) === mark && !(mark === "*" && (text[start - n - 1] === "*" || text[end + n] === "*")))
    return { text: text.slice(0, start - n) + text.slice(start, end) + text.slice(end + n), start: start - n, end: end - n };
  return { text: text.slice(0, start) + mark + text.slice(start, end) + mark + text.slice(end), start: start + n, end: end + n };
}
/** The whole item on or off (the B / I / U buttons with items picked, not typing), line by line (after any list mark). */
export function toggleAll(text: string, mark: "**" | "*" | "__") {
  const n = mark.length;
  const parts = text.split("\n").map((l) => { const m = l.match(/^(• |\d+[.)] )/)?.[0] ?? ""; return { m, w: l.slice(m.length) }; });
  const wrapped = (w: string) => w.length >= 2 * n && w.startsWith(mark) && w.endsWith(mark);
  const off = parts.filter((p) => p.w.trim()).every((p) => wrapped(p.w));
  return parts.map(({ m, w }) => (!w.trim() ? m + w : off ? m + w.slice(n, -n) : wrapped(w) ? m + w : `${m}${mark}${w}${mark}`)).join("\n");
}

/** Bullet and numbered lists (owner request 2026-11-02): lines that start with "• " or "1. ". */
export const BULLET = "• ";
const NUM = /^(\d+)[.)] /; // "1. " or "1) "
export const listMark = (line: string) => (line.startsWith(BULLET) ? BULLET : line.match(NUM)?.[0] ?? null);
/** Turns the lines the selection touches into a list, or back to plain lines when they all already are one. */
export function toggleList(text: string, start: number, end: number, kind: "bullet" | "number") {
  const a = text.lastIndexOf("\n", start - 1) + 1;
  let z = text.indexOf("\n", end > start && text[end - 1] === "\n" ? end - 1 : end); if (z < 0) z = text.length;
  const lines = text.slice(a, z).split("\n");
  const has = (l: string) => (kind === "bullet" ? l.startsWith(BULLET) : NUM.test(l));
  const strip = (l: string) => l.replace(/^• /, "").replace(NUM, "");
  const off = lines.every(has);
  const out = lines.map((l, n) => (off ? strip(l) : `${kind === "bullet" ? BULLET : `${n + 1}. `}${strip(l)}`)).join("\n");
  return { text: text.slice(0, a) + out + text.slice(z), start: a, end: a + out.length };
}
/** Enter on a list line: the next line continues the list ("• " or the next number); Enter on an empty item ends it. Null = a normal Enter. */
export function listEnter(text: string, pos: number) {
  const a = text.lastIndexOf("\n", pos - 1) + 1, line = text.slice(a, pos), mark = listMark(line);
  if (!mark) return null;
  if (line === mark) return { text: text.slice(0, a) + text.slice(pos), pos: a }; // empty item: end the list
  const next = mark === BULLET ? BULLET : `${+mark.match(NUM)![1] + 1}${mark.trim().slice(-1)} `;
  const ins = `\n${next}`;
  return { text: text.slice(0, pos) + ins + text.slice(pos), pos: pos + ins.length };
}
