"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Tab order from SPEC.md §5. Tools arrives in piece 4.
const TABS: [string, string][] = [["People", "/people"], ["Tasks", "/tasks"], ["Messages", "/messages"], ["Pipeline", "/pipeline"], ["Admin", "/admin"]];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto">
      {TABS.map(([label, href]) => {
        const on = path === href || path.startsWith(href + "/");
        return (
          <Link key={href} href={href} aria-current={on ? "page" : undefined}
            className={`border-b-[3px] px-2.5 py-3.5 whitespace-nowrap ${on ? "border-coral text-white" : "border-transparent hover:text-white"}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
