import Link from "next/link";
import { Logo } from "@/components/Logo";
import { SignOutButton } from "@/components/SignOutButton";

// Tab order from SPEC.md §5. Pages arrive phase by phase; until then they're shown but inactive.
const TABS = ["People", "Tasks", "Messages", "Pipeline", "Tools", "Admin"];

export function TopBar({ name }: { name: string }) {
  return (
    <header className="flex items-center gap-6 bg-moss px-4 text-misty">
      <Link href="/" className="flex items-center gap-2 py-3 text-white">
        <Logo />
        <span className="font-extrabold tracking-wide">PETTY HOMES <span className="rounded bg-misty px-1.5 text-xs text-charcoal">HQ</span></span>
      </Link>
      <nav aria-label="Main" className="flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <span key={t} className="cursor-default px-2.5 py-3.5 opacity-60" title="Coming in a later phase">{t}</span>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-3 text-sm">
        <span className="hidden sm:inline">{name}</span>
        <SignOutButton />
      </div>
    </header>
  );
}
