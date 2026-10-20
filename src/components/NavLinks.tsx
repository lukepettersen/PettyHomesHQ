"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { ToolsMenu, type Tool } from "@/components/ToolsMenu";

// Tab order from SPEC.md §5: People · Tasks · Messages · Pipeline · Tools ▾ · Admin.
const TABS: [string, string][] = [["People", "/people"], ["Tasks", "/tasks"], ["Messages", "/messages"], ["Pipeline", "/pipeline"], ["Admin", "/admin"]];

export function NavLinks({ tools, canEditTools, texts = 0 }: { tools: Tool[]; canEditTools: boolean; texts?: number }) {
  const path = usePathname();
  // A contact opened from another tab keeps that tab highlighted (SPEC.md §6.3).
  const from = useSearchParams().get("from");
  const active = path.startsWith("/people/") && from ? `/${from}` : null;
  return (
    <nav aria-label="Main" className="order-last -mx-4 flex w-[calc(100%+32px)] gap-1 overflow-x-auto px-2 md:order-none md:mx-0 md:w-auto md:overflow-visible md:px-0">
      {TABS.map(([label, href]) => {
        const on = active ? active === href : path === href || path.startsWith(href + "/");
        const link = (
          <Link key={href} href={href} aria-current={on ? "page" : undefined}
            className={`border-b-[3px] px-2.5 py-3.5 whitespace-nowrap ${on ? "border-coral text-white" : "border-transparent hover:text-white"}`}>
            {label}
            {href === "/messages" && texts > 0 && <span className="ml-1 rounded-full bg-coral px-1.5 text-xs font-bold text-white" aria-label={`${texts} unread`}>{texts}</span>}
          </Link>
        );
        return href === "/admin" ? [<ToolsMenu key="tools" tools={tools} canEdit={canEditTools} />, link] : link;
      })}
    </nav>
  );
}
