"use client";

import { boxText, fitText, type PostField, type PostTemplate } from "@/lib/postTemplates";

// Draws an Instagram post (owner request 2026-11-26): the photo (covering its box), the Canva design on top, then each
// text box. Everything is from HQ itself, so the finished image can be downloaded.
const FONT_CSS = "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&family=Lato:wght@400;700&family=Playfair+Display:wght@400;700&display=swap";
export function loadPostFonts() {
  if (typeof document === "undefined" || document.querySelector(`link[href="${FONT_CSS}"]`)) return;
  const l = document.createElement("link"); l.rel = "stylesheet"; l.href = FONT_CSS; document.head.appendChild(l);
}
const img = (src: string) => new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error("That image couldn't load.")); i.src = src; });

export async function renderPost(canvas: HTMLCanvasElement, t: PostTemplate, photo: string | null, values: Partial<Record<PostField, string>>) {
  loadPostFonts();
  canvas.width = t.width; canvas.height = t.height;
  const c = canvas.getContext("2d")!;
  c.clearRect(0, 0, t.width, t.height);
  c.fillStyle = "#ffffff"; c.fillRect(0, 0, t.width, t.height);
  if (photo) {
    const p = await img(photo), box = t.photo ?? { x: 0, y: 0, w: t.width, h: t.height };
    const scale = Math.max(box.w / p.width, box.h / p.height), w = p.width * scale, h = p.height * scale;
    c.save(); c.beginPath(); c.rect(box.x, box.y, box.w, box.h); c.clip();
    c.drawImage(p, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h); c.restore();
  }
  c.drawImage(await img(t.overlay), 0, 0, t.width, t.height);
  for (const b of t.boxes) {
    const text = boxText(b, values).trim();
    if (!text) continue;
    const weight = b.bold ? 700 : 400, fam = `"${b.font}", Arial, sans-serif`;
    try { await document.fonts.load(`${weight} ${b.size}px "${b.font}"`); } catch { /* falls back */ }
    const measure = (s: string, size: number) => { c.font = `${weight} ${size}px ${fam}`; return c.measureText(s).width; };
    const { size, lines } = fitText(text, b.w, b.h, b.size, measure);
    c.font = `${weight} ${size}px ${fam}`; c.fillStyle = b.field === "stars" && b.color === "#ffffff" ? "#f5c518" : b.color; c.textBaseline = "top"; c.textAlign = b.align;
    const x = b.align === "left" ? b.x : b.align === "right" ? b.x + b.w : b.x + b.w / 2;
    const top = b.y + (b.h - lines.length * size * 1.2) / 2;
    lines.forEach((l, i) => c.fillText(l, x, top + i * size * 1.2 + size * 0.1));
  }
}
