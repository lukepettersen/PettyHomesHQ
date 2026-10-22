"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  // Alerts (like a submitted offer) pop up over the page with a chime, once per device, until opened or dismissed.
  const [popup, setPopup] = useState<BellItem[]>([]);
  const audio = useRef<AudioContext | null>(null);
  const seen = () => { try { return new Set<string>(JSON.parse(localStorage.getItem("hq-alerts-seen") ?? "[]")); } catch { return new Set<string>(); } };
  const markSeen = (ids: string[]) => { try { localStorage.setItem("hq-alerts-seen", JSON.stringify([...seen(), ...ids].slice(-200))); } catch { /* private window */ } };
  useEffect(() => {
    const s = seen();
    const fresh = data.items.filter((n) => n.alert && !n.read && !s.has(n.id));
    const t = setTimeout(() => setPopup((cur) => (fresh.length && fresh.map((x) => x.id).join() !== cur.map((x) => x.id).join() ? fresh : cur)), 0);
    return () => clearTimeout(t);
  }, [data]);
  useEffect(() => {
    const unlock = () => { if (!audio.current) { try { audio.current = new AudioContext(); } catch { /* no audio */ } } else void audio.current.resume(); };
    window.addEventListener("pointerdown", unlock); window.addEventListener("keydown", unlock);
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, []);
  useEffect(() => {
    if (!popup.length) return;
    const chime = () => {
      const ctx = audio.current;
      if (!ctx || ctx.state !== "running") return;
      [0, 0.15].forEach((at, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = i ? 1046 : 784;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + at); g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.3);
        o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + 0.32);
      });
    };
    chime();
    const t = setInterval(chime, 4000);
    return () => clearInterval(t);
  }, [popup]);
  const dismiss = () => { markSeen(popup.map((n) => n.id)); setPopup([]); };

  useEffect(() => {
    const t = setInterval(load, 30000);
    window.addEventListener("focus", load);
    return () => { clearInterval(t); window.removeEventListener("focus", load); };
  }, [load]);

  const openItem = async (n: BellItem) => {
    setOpen(false);
    if (!n.read) { setData((d) => ({ unread: Math.max(0, d.unread - 1), items: d.items.map((x) => (x.id === n.id ? { ...x, read: true } : x)) })); await markNotificationRead(n.id); }
    if (n.link) router.push(n.link);
    else if (n.personId) router.push(`/people/${n.personId}`);
  };
  // Texts and missed calls open the conversation in Messages; offers open the contact.
  const heading = (n: BellItem) => (!n.link?.startsWith("/messages") ? "New offer submitted" : n.text.startsWith("Missed call") ? "Missed call" : "New text");
  const readAll = async () => {
    setData((d) => ({ unread: 0, items: d.items.map((x) => ({ ...x, read: true })) }));
    await markAllNotificationsRead();
  };

  return (
    <div ref={ref} className="relative">
      {popup.length > 0 && createPortal(
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="alert-h" className="w-full max-w-md overflow-hidden rounded-2xl bg-white text-charcoal shadow-2xl">
            <h2 id="alert-h" className="bg-moss px-5 py-3 text-lg font-extrabold text-white">{popup.length === 1 ? heading(popup[0]) : `${popup.length} new alerts`}</h2>
            <ul className="divide-y divide-misty">
              {popup.map((n) => (
                <li key={n.id} className="flex flex-col gap-2 px-5 py-3">
                  <span className="text-sm">{n.text}</span>
                  {(n.link || n.personId) && <button type="button" className="btn btn-primary self-start" onClick={() => { markSeen([n.id]); setPopup((p) => p.filter((x) => x.id !== n.id)); void openItem(n); }}>{n.link ? "Open conversation" : "Open contact"}</button>}
                </li>
              ))}
            </ul>
            <div className="flex justify-end border-t border-misty px-5 py-3"><button type="button" className="btn" onClick={dismiss}>Dismiss</button></div>
          </div>
        </div>, document.body)}
      <button type="button" aria-expanded={open} aria-label={data.unread ? `Notifications, ${data.unread} unread` : "Notifications"} onClick={() => { setOpen(!open); if (!open) load(); }}
        className="relative grid h-9 w-9 place-items-center rounded-md text-white hover:bg-white/10">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        {data.unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-coral px-1 text-[10px] font-bold text-white">{data.unread > 9 ? "9+" : data.unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-[min(340px,calc(100vw-24px))] max-sm:fixed max-sm:inset-x-3 max-sm:top-auto max-sm:w-auto rounded-lg border border-misty bg-white text-charcoal shadow-xl">
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
                    <span className="text-xs muted">{new Date(n.at).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).replace(/ (AM|PM)$/, (m) => m.trim().toLowerCase())}</span>
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
