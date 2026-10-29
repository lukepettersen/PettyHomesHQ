"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { visibleGroups, type Can } from "./sections";

/** Admin's side menu: the same groups as the Admin home page, with a way back to it. */
export function AdminNav({ can }: { can: Can }) {
  const path = usePathname();
  if (path === "/admin") return null; // the home page lists everything itself
  return (
    <nav aria-label="Admin sections" className="flex flex-col gap-3 md:sticky md:top-3 md:self-start">
      <Link href="/admin" className="px-2.5 text-sm font-semibold muted hover:text-charcoal">‹ Admin home</Link>
      {visibleGroups(can).map((g) => (
        <div key={g.name}>
          <h4 className="mb-1 flex items-center gap-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider muted"><span aria-hidden="true">{g.icon}</span>{g.name}</h4>
          {g.items.map((i) => {
            const on = path === i.href || (i.also ?? []).includes(path);
            return <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined} className={`block rounded-md px-2.5 py-1.5 text-sm ${on ? "bg-accent-soft font-bold text-accent" : "hover:bg-sunken"}`}>{i.label}</Link>;
          })}
        </div>
      ))}
    </nav>
  );
}
