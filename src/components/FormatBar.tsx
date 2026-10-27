"use client";

import { useRef, useState, type RefObject } from "react";

/**
 * Bold, Link, Bullet list and Image for an email message box. Writes **bold**, [words](link), "- " lines and
 * ![image](address) (SPEC.md §12). Images upload to the file storage and show in the email from HQ.
 */
export function FormatBar({ box, value, onChange }: { box: RefObject<HTMLTextAreaElement | null>; value: string; onChange: (v: string) => void }) {
  const edit = (fn: (sel: string) => { text: string; caret?: number }, from?: number, to?: number) => {
    const el = box.current;
    const a = from ?? el?.selectionStart ?? value.length, b = to ?? el?.selectionEnd ?? a;
    const { text, caret } = fn(value.slice(a, b));
    onChange(value.slice(0, a) + text + value.slice(b));
    const at = a + (caret ?? text.length);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at, at); });
  };
  const bold = () => edit((s) => (s ? { text: `**${s}**` } : { text: "****", caret: 2 }));
  const link = () => {
    const url = window.prompt("Link address (starts with https://)", "https://");
    if (!url || !/^https?:\/\/\S+$/.test(url.trim())) return;
    // Cursor on an image (nothing selected): the whole image becomes clickable (owner request 2026-10-27).
    const el = box.current, at = el?.selectionStart ?? 0;
    if (el && el.selectionStart === el.selectionEnd) {
      const re = /(\[)?!\[[^\]\n]*\]\(https:\/\/[^\s)]+\)(\]\(https?:\/\/[^\s)]+\))?/g;
      for (let m = re.exec(value); m; m = re.exec(value)) {
        if (at < m.index || at > m.index + m[0].length) continue;
        const bare = m[1] ? m[0].slice(1, m[0].lastIndexOf("](")) : m[0];
        edit(() => ({ text: `[${bare}](${url.trim()})` }), m.index, m.index + m[0].length);
        return;
      }
    }
    edit((s) => ({ text: `[${s || "link"}](${url.trim()})` }));
  };
  const bullets = () => {
    const el = box.current;
    const a = el?.selectionStart ?? value.length, b = el?.selectionEnd ?? a;
    const start = value.lastIndexOf("\n", a - 1) + 1;
    edit((s) => ({ text: s.split("\n").map((l) => (/^\s*[-•]\s/.test(l) ? l : `- ${l}`)).join("\n") }), start, b);
  };
  const file = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const image = async (f: File | undefined) => {
    if (!f) return;
    setError(""); setUploading(true);
    try {
      const form = new FormData(); form.append("file", f);
      const r = await fetch("/api/email-images", { method: "POST", body: form });
      const d = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!r.ok || !d.url) { setError(d.error ?? "The image didn't upload. Try again."); return; }
      const alt = f.name.replace(/\.[a-z0-9]+$/i, "").replace(/[[\]\n]/g, " ").slice(0, 60) || "image";
      const to = window.prompt("Make the image clickable? Paste the web address it should open (or leave blank).", "")?.trim() ?? "";
      const pic = `![${alt}](${d.url})`;
      edit(() => ({ text: `\n${/^https?:\/\/\S+$/.test(to) ? `[${pic}](${to})` : pic}\n` }));
    } finally { setUploading(false); if (file.current) file.current.value = ""; }
  };
  const btn = "rounded px-2 py-0.5 text-sm hover:bg-misty";
  return (
    <div role="toolbar" aria-label="Formatting" className="flex items-center gap-1 rounded-t-md border border-b-0 border-misty bg-sunken px-1.5 py-1">
      <button type="button" className={`${btn} font-bold`} onClick={bold} title="Bold (select words first)">B</button>
      <button type="button" className={`${btn} underline`} onClick={link} title="Link (select words, or put the cursor on an image)">Link</button>
      <button type="button" className={btn} onClick={bullets} title="Bullet list">• List</button>
      <button type="button" className={btn} disabled={uploading} onClick={() => file.current?.click()} title="Add an image (banner, logo, photo)">{uploading ? "Uploading…" : "Image"}</button>
      <input ref={file} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" aria-label="Add an image" onChange={(e) => void image(e.target.files?.[0])} />
      {error ? <span role="alert" className="ml-auto pr-1 text-[11px] text-bad">{error}</span> : <span className="ml-auto pr-1 text-[11px] muted">Web addresses become links automatically.</span>}
    </div>
  );
}
