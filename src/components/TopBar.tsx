import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/Logo";
import { NavLinks } from "@/components/NavLinks";
import { SignOutButton } from "@/components/SignOutButton";
import { Bell } from "@/components/Bell";
import type { Tool } from "@/components/ToolsMenu";
import type { BellItem } from "@/server/notifications";

export function TopBar({ name, tools, canEditTools, bell }: { name: string; tools: Tool[]; canEditTools: boolean; bell: { unread: number; items: BellItem[] } }) {
  return (
    <header className="flex flex-wrap items-center gap-x-6 bg-moss px-4 text-misty">
      <Link href="/people" className="flex items-center gap-2 py-3 text-white">
        <Logo />
        <span className="font-extrabold tracking-wide whitespace-nowrap">PETTY HOMES <span className="rounded bg-misty px-1.5 text-xs text-charcoal">HQ</span></span>
      </Link>
      <Suspense fallback={<nav aria-label="Main" className="flex-1" />}><NavLinks tools={tools} canEditTools={canEditTools} /></Suspense>
      <form action="/people" className="ml-auto hidden md:block" role="search">
        <input type="search" name="q" placeholder="Search people…" aria-label="Search people"
          className="w-56 rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white placeholder:text-misty/70 outline-none focus:bg-white focus:text-charcoal lg:w-72" />
      </form>
      <div className="ml-auto flex items-center gap-3 text-sm md:ml-0">
        <Bell initial={bell} />
        <span className="hidden sm:inline">{name}</span>
        <SignOutButton />
      </div>
    </header>
  );
}
