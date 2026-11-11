import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/Logo";
import { NavLinks } from "@/components/NavLinks";
import type { NavKey } from "@/lib/nav";
import { SignOutButton } from "@/components/SignOutButton";
import { Bell } from "@/components/Bell";
import { SearchBox } from "@/components/SearchBox";
import { AskClaude } from "@/components/AskClaude";
import type { Tool } from "@/components/ToolsMenu";
import type { BellItem } from "@/server/notifications";

export function TopBar({ name, tools, canEditTools, bell, texts, claude, owner = false, order }: { name: string; tools: Tool[]; canEditTools: boolean; bell: { unread: number; items: BellItem[] }; texts: number; claude: boolean; owner?: boolean; order: NavKey[] }) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 bg-moss px-4 text-misty xl:gap-x-6">
      <Link href="/people" className="flex items-center gap-2 py-3 text-white">
        <Logo />
        <span className="font-extrabold tracking-wide whitespace-nowrap"><span className="hidden sm:inline">PETTY HOMES </span><span className="rounded bg-misty px-1.5 text-xs text-charcoal">HQ</span></span>
      </Link>
      <Suspense fallback={<nav aria-label="Main" className="flex-1" />}><NavLinks tools={tools} canEditTools={canEditTools} texts={texts} owner={owner} order={order} /></Suspense>
      <SearchBox />
      <div className="flex items-center gap-3 text-sm">
        <AskClaude connected={claude} />
        <Bell initial={bell} />
        <span className="hidden 2xl:inline">{name}</span>
        <Link href="/settings" aria-label="My settings" title="My settings (sounds)" className="rounded-md p-1 hover:bg-white/10">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
        </Link>
        <SignOutButton />
      </div>
    </header>
  );
}
