import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/Logo";
import { NavLinks } from "@/components/NavLinks";
import { SignOutButton } from "@/components/SignOutButton";
import { Bell } from "@/components/Bell";
import { SearchBox } from "@/components/SearchBox";
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
      <SearchBox />
      <div className="ml-auto flex items-center gap-3 text-sm md:ml-0">
        <Bell initial={bell} />
        <span className="hidden sm:inline">{name}</span>
        <SignOutButton />
      </div>
    </header>
  );
}
