"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS: [string, [string, string | null][]][] = [
  ["Team", [["Users & roles", "/admin/users"], ["Trash", "/admin/trash"]]],
  ["People", [["Stages, sources & follow-up", "/admin/lists"], ["Tags", "/admin/tags"], ["Date reminders", "/admin/reminders"], ["Custom fields", "/admin/fields"]]],
  ["Deals", [["Client statuses", null], ["Purchase agreement forms", null], ["Task templates", null]]],
  ["Connections", [["Tools menu", "/admin/tools"], ["Integrations", null]]],
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="Admin sections" className="flex flex-col gap-3 md:sticky md:top-3 md:self-start">
      {SECTIONS.map(([group, items]) => (
        <div key={group}>
          <h4 className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider muted">{group}</h4>
          {items.map(([label, href]) => href ? (
            <Link key={label} href={href} className={`block rounded-md px-2.5 py-1.5 text-sm ${path === href ? "bg-accent-soft font-bold text-accent" : "hover:bg-sunken"}`}>{label}</Link>
          ) : (
            <span key={label} className="block cursor-default px-2.5 py-1.5 text-sm text-rabbit" title="Coming in a later update">{label}</span>
          ))}
        </div>
      ))}
    </nav>
  );
}
