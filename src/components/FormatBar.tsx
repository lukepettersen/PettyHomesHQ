"use client";

import type { RefObject } from "react";

/** Bold, Link and Bullet list for an email message box. Writes **bold**, [words](link) and "- " lines (SPEC.md §12). */
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
    edit((s) => ({ text: `[${s || "link"}](${url.trim()})` }));
  };
  const bullets = () => {
    const el = box.current;
    const a = el?.selectionStart ?? value.length, b = el?.selectionEnd ?? a;
    const start = value.lastIndexOf("\n", a - 1) + 1;
    edit((s) => ({ text: s.split("\n").map((l) => (/^\s*[-•]\s/.test(l) ? l : `- ${l}`)).join("\n") }), start, b);
  };
  const btn = "rounded px-2 py-0.5 text-sm hover:bg-misty";
  return (
    <div role="toolbar" aria-label="Formatting" className="flex items-center gap-1 rounded-t-md border border-b-0 border-misty bg-sunken px-1.5 py-1">
      <button type="button" className={`${btn} font-bold`} onClick={bold} title="Bold (select words first)">B</button>
      <button type="button" className={`${btn} underline`} onClick={link} title="Link (select words first)">Link</button>
      <button type="button" className={btn} onClick={bullets} title="Bullet list">• List</button>
      <span className="ml-auto pr-1 text-[11px] muted">Web addresses become links automatically.</span>
    </div>
  );
}
