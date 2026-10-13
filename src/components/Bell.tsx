"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useDropdown } from "@/components/useDropdown";
import { markAllNotificationsRead, markNotificationRead } from "@/app/notificationActions";
import type { BellItem } from "@/server/notifications";

type Bell = { unread: number; items: BellItem[] };

/** @mentions for the signed-in user: unread count, Mark all read, click to open the person. */
export function Bell({ initial }: { initial: Bell }) {
  const [data, setData] = useState(initial);
  const { open, setOpen, ref } = useDropdown<HTMLDivElement>();
  const router = useRouter();
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/notifications", { cache: "no-store" });
      if (r.ok) setData(await r.json());
    } catch { /* offline: keep what we have */ }
  }, []);
  useEffect(() => {
    const t = setInterval(load, 60000);
    window.addEventListener("focus", load);
    return () => { clearInterval(t); window.removeEventListener("focus", load); };
  }, [load]);

  const openItem = async (n: BellItem) => {
    setOpen(false);
    if (!n.read) { setData((d) => ({ unread: Math.max(0, d.unread - 1), items: d.items.map((x) => (x.id === n.id ? { ...x, read: true } : x)) })); await markNotificationRead(n.id); }
    if (n.personId) router.push(`/people/${n.personId}`);
  };
  const readAll = async () => {
    setData((d) => ({ unread: 0, items: d.items.map((x) => ({ ...x, read: true })) }));
    await markAllNotificationsRead();
  };

  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} aria-label={data.unread ? `Notifications, ${data.unread} unread` : "Notifications"} onClick={() => { setOpen(!open); if (!open) load(); }}
        className="relative grid h-9 w-9 place-items-center rounded-md text-white hover:bg-white/10">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        {data.unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-coral px-1 text-[10px] font-bold text-white">{data.unread > 9 ? "9+" : data.unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-[min(340px,calc(100vw-24px))] rounded-lg border border-misty bg-white text-charcoal shadow-xl">
          <div className="flex items-center justify-between border-b border-misty px-3 py-2">
            <b className="text-sm">Notifications</b>
            {data.unread > 0 && <button type="button" className="link text-xs" onClick={readAll}>Mark all read</button>}
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {data.items.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => openItem(n)} className={`flex w-full gap-2 border-b border-misty/60 px-3 py-2 text-left text-sm last:border-0 hover:bg-sunken ${n.read ? "muted" : ""}`}>
                  <span aria-hidden="true" className={`mt-1.5 h-2 w-2 flex-none rounded-full ${n.read ? "bg-transparent" : "bg-coral"}`} />
                  <span className="min-w-0">
                    <span className="block break-words">{n.text}</span>
                    <span className="text-xs muted">{new Date(n.at).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                  </span>
                </button>
              </li>
            ))}
            {data.items.length === 0 && <li className="px-3 py-5 text-center text-sm muted">No mentions yet. When someone types @ and your name in a note, it shows up here.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
