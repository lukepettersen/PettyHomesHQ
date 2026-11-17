"use client";

import Link from "next/link";
import { useDropdown } from "@/components/useDropdown";

export type Tool = { name: string; url: string };

/** Tools ▾: the owner's links from Admin → Tools menu, opened in a new tab (SPEC.md §5). */
export function ToolsMenu({ tools, canEdit }: { tools: Tool[]; canEdit: boolean }) {
  const { open, setOpen, ref } = useDropdown<HTMLDivElement>();
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}
        className={`border-b-[3px] px-2.5 py-3.5 whitespace-nowrap ${open ? "border-coral text-white" : "border-transparent hover:text-white"}`}>
        Tools <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 flex w-60 flex-col max-md:fixed max-md:inset-x-3 max-md:top-[108px] max-md:w-auto rounded-lg border border-misty bg-white p-1.5 text-charcoal shadow-xl">
          {tools.map((t) => (
            <a key={t.name + t.url} href={t.url} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className="rounded-md px-2.5 py-2 text-sm hover:bg-sunken">
              {t.name} <span aria-hidden="true" className="muted">↗</span><span className="sr-only">(opens in a new tab)</span>
            </a>
          ))}
          {tools.length === 0 && !canEdit && <span className="px-2.5 py-2 text-sm muted">No tools yet. Ask Luke to add some.</span>}
          {canEdit && (
            <Link href="/admin/tools" onClick={() => setOpen(false)} className={`rounded-md px-2.5 py-2 text-sm font-semibold text-accent hover:bg-sunken ${tools.length ? "mt-1 border-t border-misty" : ""}`}>
              {tools.length ? "Edit tools" : "+ Add a tool"}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
