"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** Every few minutes (and when HQ is opened), new Gmail emails come onto timelines; the open contact refreshes. */
export function GmailSync() {
  const router = useRouter();
  const pathname = usePathname();
  const path = useRef(pathname);
  useEffect(() => { path.current = pathname; }, [pathname]);
  useEffect(() => {
    const run = async () => {
      try {
        const r = await fetch("/api/gmail/sync", { method: "POST", cache: "no-store" });
        const j = r.ok ? ((await r.json()) as { added: number }) : { added: 0 };
        if (j.added > 0 && path.current.startsWith("/people/")) router.refresh();
      } catch { /* offline */ }
    };
    const kick = setTimeout(run, 2000);
    const t = setInterval(run, 4 * 60000);
    return () => { clearTimeout(kick); clearInterval(t); };
  }, [router]);
  return null;
}
