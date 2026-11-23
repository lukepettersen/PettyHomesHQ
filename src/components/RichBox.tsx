"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { toHtml } from "@/lib/email";
import { domToMarkdown, editorHtml } from "@/lib/richText";

/**
 * The email message box, showing formatting as you type (owner request 2026-11-23: "can it just show as bold?"):
 * bold looks bold, links look like links, bullet lists and images show. `value` / `onChange` are still HQ's light
 * formatting (**bold**, [words](link), "- " bullets, ![image](address)), so templates, merge fields and sending
 * are unchanged. Pasting keeps the words only. Replaces FormatBar + textarea in every email box.
 */
export type RichHandle = { insert: (text: string) => void };
export function RichBox({ value, onChange, placeholder = "", label = "Message", minHeight = "10rem", handle }: {
  value: string; onChange: (v: string) => void; placeholder?: string; label?: string; minHeight?: string; handle?: Ref<RichHandle>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const saved = useRef<Range | null>(null); // where the cursor was, so a merge-field button inserts there
  const remember = () => { const sel = window.getSelection(); if (sel && sel.rangeCount && box.current?.contains(sel.anchorNode)) saved.current = sel.getRangeAt(0).cloneRange(); };
  const last = useRef<string | null>(null); // what this box last sent up, so typing doesn't reset the cursor
  const shown = useRef<{ md: string; value: string } | null>(null); // the value as loaded: unchanged text keeps its exact spacing
  const [empty, setEmpty] = useState(!value.trim());
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  // A new value from outside (a template picked, Clear): show it.
  useEffect(() => {
    if (!box.current || value === last.current) return;
    box.current.innerHTML = value ? editorHtml(value, toHtml) : "";
    last.current = value;
    shown.current = { md: domToMarkdown(box.current), value };
    setEmpty(!value.trim());
  }, [value]);

  const emit = () => {
    if (!box.current) return;
    let md = domToMarkdown(box.current);
    if (shown.current && md === shown.current.md) md = shown.current.value; // nothing edited: no change
    last.current = md;
    setEmpty(!md.trim() && !box.current.querySelector("img"));
    onChange(md);
  };
  useImperativeHandle(handle, () => ({
    insert: (text: string) => {
      box.current?.focus();
      const sel = window.getSelection();
      if (saved.current && sel) { sel.removeAllRanges(); sel.addRange(saved.current); }
      else if (box.current && sel) { const r = document.createRange(); r.selectNodeContents(box.current); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
      document.execCommand("insertText", false, text);
      remember();
      emit();
    },
  }));
  const cmd = (name: string, arg?: string) => { box.current?.focus(); document.execCommand(name, false, arg); emit(); };
  const link = () => {
    const sel = window.getSelection();
    const picked = sel && !sel.isCollapsed && box.current?.contains(sel.anchorNode) ? sel.toString() : "";
    const range = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    const url = window.prompt("Link address (starts with https://)", "https://")?.trim();
    if (!url || !/^https?:\/\/\S+$/.test(url)) return;
    box.current?.focus();
    if (range) { sel?.removeAllRanges(); sel?.addRange(range); }
    if (picked) cmd("createLink", url);
    else cmd("insertHTML", `<a href="${url.replace(/"/g, "%22")}">${url.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</a>&nbsp;`);
  };
  const file = useRef<HTMLInputElement>(null);
  const image = async (f: File | undefined) => {
    if (!f) return;
    setError(""); setUploading(true);
    const sel = window.getSelection();
    const range = sel && sel.rangeCount && box.current?.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
    try {
      const form = new FormData(); form.append("file", f);
      const r = await fetch("/api/email-images", { method: "POST", body: form });
      const d = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!r.ok || !d.url) { setError(d.error ?? "The image didn't upload. Try again."); return; }
      const alt = f.name.replace(/\.[a-z0-9]+$/i, "").replace(/[[\]\n"<>]/g, " ").slice(0, 60) || "image";
      const to = window.prompt("Make the image clickable? Paste the web address it should open (or leave blank).", "")?.trim() ?? "";
      const pic = `<img src="${d.url}" alt="${alt}" style="display:block;max-width:100%;height:auto">`;
      box.current?.focus();
      if (range) { sel?.removeAllRanges(); sel?.addRange(range); }
      cmd("insertHTML", (/^https?:\/\/\S+$/.test(to) ? `<a href="${to.replace(/"/g, "%22")}">${pic}</a>` : pic) + "<br>");
    } finally { setUploading(false); if (file.current) file.current.value = ""; }
  };

  const btn = "rounded px-2 py-0.5 text-sm hover:bg-misty";
  const keep = (e: React.MouseEvent) => e.preventDefault(); // the toolbar doesn't take the cursor out of the box
  return (
    <div>
      <div role="toolbar" aria-label="Formatting" className="flex items-center gap-1 rounded-t-md border border-b-0 border-misty bg-sunken px-1.5 py-1">
        <button type="button" className={`${btn} font-bold`} onMouseDown={keep} onClick={() => cmd("bold")} title="Bold">B</button>
        <button type="button" className={`${btn} underline`} onMouseDown={keep} onClick={link} title="Link (select words first, or add a web address)">Link</button>
        <button type="button" className={btn} onMouseDown={keep} onClick={() => cmd("insertUnorderedList")} title="Bullet list">• List</button>
        <button type="button" className={btn} onMouseDown={keep} disabled={uploading} onClick={() => file.current?.click()} title="Add an image (banner, logo, photo)">{uploading ? "Uploading…" : "Image"}</button>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" aria-label="Add an image" onChange={(e) => void image(e.target.files?.[0])} />
        {error ? <span role="alert" className="ml-auto pr-1 text-[11px] text-bad">{error}</span> : <span className="ml-auto pr-1 text-[11px] muted">Web addresses become links automatically.</span>}
      </div>
      <div className="relative">
        {empty && placeholder && <span aria-hidden="true" className="pointer-events-none absolute left-3 top-2 text-sm muted">{placeholder}</span>}
        <div ref={box} role="textbox" aria-multiline="true" aria-label={label} contentEditable suppressContentEditableWarning
          className="input max-h-[70vh] overflow-y-auto rounded-t-none font-normal [&_a]:text-accent [&_a]:underline [&_img]:my-1 [&_img]:max-w-full [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
          style={{ minHeight }} onInput={() => { emit(); remember(); }} onBlur={() => { remember(); emit(); }} onKeyUp={remember} onMouseUp={remember}
          onPaste={(e) => { e.preventDefault(); document.execCommand("insertText", false, e.clipboardData.getData("text/plain")); emit(); }}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") { e.preventDefault(); cmd("bold"); } }} />
      </div>
    </div>
  );
}
