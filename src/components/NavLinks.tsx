"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { ToolsMenu, type Tool } from "@/components/ToolsMenu";
import { NAV_ITEMS, type NavKey } from "@/lib/nav";

// Tab order from Admin → Top bar (default: Whiteboard (owner only) · Tasks · Messages · People · Pipeline · Tools ▾ · Admin).
export function NavLinks({ tools, canEditTools, texts = 0, owner = false, order }: { tools: Tool[]; canEditTools: boolean; texts?: number; owner?: boolean; order: NavKey[] }) {
  const path = usePathname();
  // A contact opened from another tab keeps that tab highlighted (SPEC.md §6.3).
  const from = useSearchParams().get("from");
  const active = path.startsWith("/people/") && from ? `/${from}` : null;
  return (
    <nav aria-label="Main" className="order-last -mx-4 flex w-[calc(100%+32px)] gap-1 overflow-x-auto px-2 md:order-none md:mx-0 md:w-auto md:overflow-visible md:px-0">
      {order.filter((k) => owner || k !== "whiteboard").map((k) => NAV_ITEMS.find((i) => i.key === k)!).map(({ key, label, href }) => {
        if (key === "tools") return <ToolsMenu key="tools" tools={tools} canEdit={canEditTools} />;
        const on = active ? active === href : path === href || path.startsWith(href + "/");
        const link = (
          <Link key={href} href={href} aria-current={on ? "page" : undefined}
            className={`border-b-[3px] px-2.5 py-3.5 whitespace-nowrap ${on ? "border-coral text-white" : "border-transparent hover:text-white"}`}>
            {label}
            {href === "/messages" && texts > 0 && <span className="ml-1 rounded-full bg-coral px-1.5 text-xs font-bold text-white" aria-label={`${texts} unread`}>{texts}</span>}
          </Link>
        );
        return link;
      })}
    </nav>
  );
}
