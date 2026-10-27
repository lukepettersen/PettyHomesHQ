"use client";

import { useState } from "react";
import { toHtml } from "@/lib/email";

/** "Preview": the message as it will look in their inbox (images, clickable links, bold, lists). Owner request 2026-10-27. */
export function EmailPreview({ body }: { body: string }) {
  const [open, setOpen] = useState(false);
  if (!body.trim()) return null;
  return (
    <div className="mt-1">
      <button type="button" className="text-sm font-semibold text-accent hover:underline" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide preview" : "Preview"}</button>
      {/* toHtml escapes everything typed and only adds images, links, bold and lists, so this is safe to show. */}
      {open && <div className="mt-1 max-h-[480px] overflow-auto rounded-md border border-misty bg-white p-3 text-sm font-normal [&_a]:text-accent [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: toHtml(body) }} />}
    </div>
  );
}
