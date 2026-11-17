"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { ToolsMenu, type Tool } from "@/components/ToolsMenu";
import { useDropdown } from "@/components/useDropdown";
import { NAV_ITEMS, type NavKey } from "@/lib/nav";

// Tab order from Admin → Top bar (default: Whiteboard (owner only) · Tasks · Messages · People · Pipeline · Tools ▾ · Admin).
// On a phone (owner report 2026-11-02) the first four tabs share the width and the rest go under More ▾.
export function NavLinks({ tools, canEditTools, texts = 0, owner = false, order }: { tools: Tool[]; canEditTools: boolean; texts?: number; owner?: boolean; order: NavKey[] }) {
  const path = usePathname();
  // A contact opened from another tab keeps that tab highlighted (SPEC.md §6.3).
  const from = useSearchParams().get("from");
  const active = path.startsWith("/people/") && from ? `/${from}` : null;
  const isOn = (href: string) => (active ? active === href : path === href || path.startsWith(href + "/"));
  const items = order.filter((k) => owner || k !== "whiteboard").map((k) => NAV_ITEMS.find((i) => i.key === k)!);
  const badge = (href: string) => href === "/messages" && texts > 0 && <span className="ml-1 rounded-full bg-coral px-1.5 text-xs font-bold text-white" aria-label={`${texts} unread`}>{texts}</span>;
  const shown = items.filter((i) => i.key !== "tools").slice(0, 4), more = items.filter((i) => !shown.some((s) => s.key === i.key));
  return (
    <>
      <nav aria-label="Main" className="hidden gap-1 md:flex">
        {items.map(({ key, label, href }) => key === "tools" ? <ToolsMenu key="tools" tools={tools} canEdit={canEditTools} /> : (
          <Link key={href} href={href} aria-current={isOn(href) ? "page" : undefined}
            className={`border-b-[3px] px-2.5 py-3.5 whitespace-nowrap ${isOn(href) ? "border-coral text-white" : "border-transparent hover:text-white"}`}>
            {label}{badge(href)}
          </Link>
        ))}
      </nav>
      <nav aria-label="Main" className="order-last -mx-4 grid w-[calc(100%+32px)] grid-cols-5 md:hidden">
        {shown.map(({ label, href }) => (
          <Link key={href} href={href} aria-current={isOn(href) ? "page" : undefined}
            className={`flex items-center justify-center border-b-[3px] px-1 py-3 text-[15px] whitespace-nowrap ${isOn(href) ? "border-coral font-semibold text-white" : "border-transparent"}`}>
            {href === "/whiteboard" ? "Board" : label}{badge(href)}
          </Link>
        ))}
        <MoreMenu items={more} tools={tools} canEditTools={canEditTools} isOn={isOn} />
      </nav>
    </>
  );
}

/** Phone: the tabs that don't fit, and the Tools links, in one menu. */
function MoreMenu({ items, tools, canEditTools, isOn }: { items: (typeof NAV_ITEMS)[number][]; tools: Tool[]; canEditTools: boolean; isOn: (href: string) => boolean }) {
  const { open, setOpen, ref } = useDropdown<HTMLDivElement>();
  const here = items.some((i) => i.href && isOn(i.href));
  return (
    <div ref={ref} className="flex">
      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}
        className={`flex w-full items-center justify-center border-b-[3px] px-1 py-3 text-[15px] ${here || open ? "border-coral font-semibold text-white" : "border-transparent"}`}>
        More <span aria-hidden="true" className="ml-0.5 text-xs">▾</span>
      </button>
      {open && (
        <div className="fixed inset-x-3 top-[108px] z-40 flex flex-col rounded-lg border border-misty bg-white p-1.5 text-charcoal shadow-xl">
          {items.filter((i) => i.key !== "tools").map((i) => (
            <Link key={i.href} href={i.href} onClick={() => setOpen(false)} className={`rounded-md px-3 py-2.5 ${isOn(i.href) ? "bg-sunken font-semibold" : "hover:bg-sunken"}`}>{i.label}</Link>
          ))}
          {items.some((i) => i.key === "tools") && (tools.length > 0 || canEditTools) && <>
            <span className="mt-1 border-t border-misty px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider muted">Tools</span>
            {tools.map((t) => <a key={t.name + t.url} href={t.url} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className="rounded-md px-3 py-2.5 hover:bg-sunken">{t.name} <span aria-hidden="true" className="muted">↗</span></a>)}
            {canEditTools && <Link href="/admin/tools" onClick={() => setOpen(false)} className="rounded-md px-3 py-2.5 text-sm font-semibold text-accent hover:bg-sunken">Edit tools</Link>}
          </>}
        </div>
      )}
    </div>
  );
}
