"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Can = { settings: boolean; templates: boolean; trash: boolean; messages: boolean; owner: boolean };
const NEEDS: Record<string, keyof Can> = { "/admin/templates": "templates", "/admin/trash": "trash", "/admin/messages": "messages", "/admin/activity": "owner" };

const SECTIONS: [string, [string, string | null][]][] = [
  ["Team", [["Users & roles", "/admin/users"], ["Activity", "/admin/activity"], ["Trash", "/admin/trash"]]],
  ["Data", [["Import from Follow Up Boss", "/admin/import"]]],
  ["People", [["Stages, sources & follow-up", "/admin/lists"], ["Tags", "/admin/tags"], ["Date reminders", "/admin/reminders"], ["Custom fields", "/admin/fields"]]],
  ["Deals", [["Client statuses", "/admin/statuses"], ["Buyer and seller forms", "/admin/file-forms"], ["Purchase agreement forms", "/admin/forms"], ["Task templates", "/admin/templates"]]],
  ["Messaging", [["Text & email templates", "/admin/messages"]]],
  ["Connections", [["Tools menu", "/admin/tools"], ["Appointment types", "/admin/appointments"], ["Calendar invites", "/admin/calendar"], ["Integrations", "/admin/integrations"]]],
];

export function AdminNav({ can }: { can: Can }) {
  const path = usePathname();
  const allowed = (href: string) => can[NEEDS[href] ?? "settings"];
  return (
    <nav aria-label="Admin sections" className="flex flex-col gap-3 md:sticky md:top-3 md:self-start">
      {SECTIONS.map(([group, all]) => [group, all.filter(([, href]) => !href || allowed(href))] as const).filter(([, items]) => items.some(([, h]) => h)).map(([group, items]) => (
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
