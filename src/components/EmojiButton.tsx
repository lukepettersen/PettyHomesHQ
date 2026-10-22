"use client";

import { useState, type RefObject } from "react";

const EMOJI = ["❤️", "👍", "😂", "😊", "🎉", "🙌", "🏡", "🔑", "✅", "🙏", "👏", "😍"];

/** A few common emoji to drop into a text where the cursor is (texts go out as normal SMS; owner 2026-10-22). */
export function EmojiButton({ box, value, onChange }: { box: RefObject<HTMLTextAreaElement | null>; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const add = (e: string) => {
    const el = box.current;
    const a = el?.selectionStart ?? value.length, b = el?.selectionEnd ?? a;
    onChange(value.slice(0, a) + e + value.slice(b));
    setOpen(false);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(a + e.length, a + e.length); });
  };
  return (
    <span className="relative">
      <button type="button" className="btn px-2" aria-label="Add an emoji" aria-expanded={open} onClick={() => setOpen(!open)}>😊</button>
      {open && (
        <span role="menu" className="absolute bottom-full right-0 z-30 mb-1 grid w-max grid-cols-6 gap-0.5 rounded-lg border border-misty bg-white p-1 shadow-lg">
          {EMOJI.map((e) => <button key={e} type="button" role="menuitem" className="rounded p-1 text-lg hover:bg-sunken" onClick={() => add(e)}>{e}</button>)}
        </span>
      )}
    </span>
  );
}
