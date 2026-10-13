import Link from "next/link";
import { Logo } from "@/components/Logo";
import { NavLinks } from "@/components/NavLinks";
import { SignOutButton } from "@/components/SignOutButton";

export function TopBar({ name }: { name: string }) {
  return (
    <header className="flex items-center gap-6 bg-moss px-4 text-misty">
      <Link href="/people" className="flex items-center gap-2 py-3 text-white">
        <Logo />
        <span className="font-extrabold tracking-wide whitespace-nowrap">PETTY HOMES <span className="rounded bg-misty px-1.5 text-xs text-charcoal">HQ</span></span>
      </Link>
      <NavLinks />
      <div className="ml-auto flex items-center gap-3 text-sm">
        <span className="hidden sm:inline">{name}</span>
        <SignOutButton />
      </div>
    </header>
  );
}
