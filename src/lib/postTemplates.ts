// Instagram post templates (owner request 2026-11-26): a design downloaded from Canva as a PNG with the house photo and
// the changing words removed (transparent), plus boxes for the photo and each piece of text. HQ puts the deal's photo
// behind the design, writes the text on top and downloads the finished post. Pure, unit tested in postTemplates.test.ts.

export const POST_FIELDS = {
  title: "Title (e.g. Under Contract)", beds: "Beds", baths: "Baths", garage: "Garage stalls", city: "City", address: "Street address",
  price: "Price", review: "Review text", reviewer: "Reviewer name", stars: "Stars", custom: "Your own text",
} as const;
export type PostField = keyof typeof POST_FIELDS;
export const POST_FONTS = ["Mukta Mahee", "Montserrat", "Lato", "Playfair Display", "Arial"] as const;

export type TextBox = { id: string; field: PostField; text: string; x: number; y: number; w: number; h: number; size: number; color: string; align: "left" | "center" | "right"; font: string; bold: boolean };
export type PostTemplate = { id: string; name: string; overlay: string; width: number; height: number; photo: { x: number; y: number; w: number; h: number } | null; boxes: TextBox[] };

const num = (v: unknown, lo: number, hi: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d; };
const str = (v: unknown, max: number, d = "") => (typeof v === "string" ? v.slice(0, max) : d);

/** Saved templates (AppSetting `posts.templates`) → clean list: overlays only from HQ's own image store. */
export function cleanTemplates(v: unknown): PostTemplate[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 30).flatMap((t): PostTemplate[] => {
    if (!t || typeof t !== "object") return [];
    const o = t as Record<string, unknown>;
    const overlay = str(o.overlay, 200);
    if (!/^\/api\/img\/[A-Za-z0-9_-]{24}\.(png|jpg|gif|webp)$/.test(overlay)) return [];
    const width = num(o.width, 200, 5000, 1080), height = num(o.height, 200, 5000, 1350);
    const p = o.photo as Record<string, unknown> | null;
    const photo = p && typeof p === "object" ? { x: num(p.x, 0, width, 0), y: num(p.y, 0, height, 0), w: num(p.w, 10, width, width), h: num(p.h, 10, height, height) } : null;
    const boxes = (Array.isArray(o.boxes) ? o.boxes : []).slice(0, 20).flatMap((b): TextBox[] => {
      if (!b || typeof b !== "object") return [];
      const x = b as Record<string, unknown>;
      const field = (typeof x.field === "string" && x.field in POST_FIELDS ? x.field : "custom") as PostField;
      return [{ id: str(x.id, 40) || `b${Math.random().toString(36).slice(2, 8)}`, field, text: str(x.text, 300), x: num(x.x, 0, width, 0), y: num(x.y, 0, height, 0), w: num(x.w, 10, width, 300), h: num(x.h, 10, height, 80),
        size: num(x.size, 8, 400, 48), color: /^#[0-9a-f]{6}$/i.test(str(x.color, 7)) ? str(x.color, 7) : "#ffffff", align: x.align === "left" || x.align === "right" ? x.align : "center",
        font: (POST_FONTS as readonly string[]).includes(str(x.font, 40)) ? str(x.font, 40) : POST_FONTS[0], bold: x.bold === true }];
    });
    return [{ id: str(o.id, 40) || `t${Math.random().toString(36).slice(2, 8)}`, name: str(o.name, 60).trim() || "Post", overlay, width, height, photo, boxes }];
  });
}

/** What HQ fills in from a deal (each can be changed before downloading). Reads the deal's answers by their names. */
export function dealValues(d: { address: string | null; price: number | null; info: Record<string, unknown>; personName: string }): Partial<Record<PostField, string>> {
  const find = (re: RegExp) => { const k = Object.keys(d.info).find((x) => re.test(x)); const v = k ? d.info[k] : ""; return v === null || v === undefined ? "" : String(v); };
  const parts = (d.address ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const stateZip = parts[parts.length - 1] ?? "";
  const city = parts.length >= 3 ? `${parts[parts.length - 2]} ${stateZip.split(/\s+/)[0] ?? ""}`.trim() : parts[1] ?? "";
  return {
    beds: find(/bed/i), baths: find(/bath/i), garage: find(/garage|stall/i), city, address: parts[0] ?? "",
    price: d.price ? `$${d.price.toLocaleString("en-US")}` : "", reviewer: d.personName.split(/\s*(?:&|and)\s*/)[0]?.split(/\s+/)[0] ?? "", stars: "★★★★★",
  };
}

/** The words for one box: its own text for a title / your own text, else the filled-in value. */
export const boxText = (b: TextBox, values: Partial<Record<PostField, string>>) => (b.field === "title" || b.field === "custom" ? b.text : values[b.field] ?? b.text);

/** Breaks text into lines that fit `width` (measured by `measure`), shrinking the size until it fits `height`. */
export function fitText(text: string, w: number, h: number, size: number, measure: (s: string, size: number) => number): { size: number; lines: string[] } {
  for (let s = size; s >= 8; s -= Math.max(1, Math.round(s * 0.06))) {
    const lines: string[] = [];
    for (const para of text.split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (line && measure(next, s) > w) { lines.push(line); line = word; } else line = next;
      }
      lines.push(line);
    }
    if (lines.length * s * 1.2 <= h && lines.every((l) => measure(l, s) <= w)) return { size: s, lines };
  }
  return { size: 8, lines: [text] };
}
