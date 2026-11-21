"use client";

import { useEffect, useState } from "react";
import type { EventView } from "@/server/events";
import { EventSlots } from "./EventClient";
import { GamesTab, ImportTab } from "./Games";
import { WaitlistCard } from "./Waitlist";
import { Reminders, SignupSettings } from "./EventSide";

type Tab = "games" | "waitlist" | "reminders" | "signup" | "import";

/** The event page's tabs (owner request 2026-11-22: friendlier Events page). The tab is kept in the address (#waitlist). */
export function EventTabs({ e, today }: { e: EventView; today: string }) {
  const tabs: [Tab, string, number | null][] = [
    ["games", e.multiSlot ? "Games" : "People", e.multiSlot ? e.slots.filter((s) => s.date >= today).length : e.attendees.length],
    ...(e.multiSlot ? [["waitlist", "Waitlist", e.waitlist.filter((w) => w.waiting).length] as [Tab, string, number]] : []),
    ["reminders", "Reminder texts", e.reminders.filter((r) => r.active).length],
    ["signup", "Signup page", null],
    ...(e.multiSlot ? [["import", "Import", null] as [Tab, string, null]] : []),
  ];
  const [tab, setTabState] = useState<Tab>("games");
  // Opened with #waitlist etc.: that tab (read after the first paint, so the server and browser agree).
  useEffect(() => { const h = window.location.hash.slice(1); const t = setTimeout(() => { if (["waitlist", "reminders", "signup", "import"].includes(h)) setTabState(h as Tab); }, 0); return () => clearTimeout(t); }, []);
  const setTab = (t: Tab) => { setTabState(t); try { history.replaceState(null, "", t === "games" ? window.location.pathname : `#${t}`); } catch { /* fine */ } };
  return (
    <div className="mt-3">
      <div className="flex gap-1 overflow-x-auto border-b border-misty" role="tablist" aria-label="Event">
        {tabs.map(([k, label, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-[3px] px-3 py-2 text-sm font-semibold ${tab === k ? "border-coral text-charcoal" : "border-transparent muted hover:text-charcoal"}`}>
            {label}{n !== null && <span className={`rounded-full px-1.5 text-xs ${tab === k ? "bg-accent text-white" : "bg-sunken"}`}>{n}</span>}
          </button>
        ))}
      </div>
      <div className="mt-3" role="tabpanel">
        {tab === "games" && (e.multiSlot ? <GamesTab e={e} today={today} /> : <EventSlots e={e} today={today} />)}
        {tab === "waitlist" && <WaitlistCard e={e} />}
        {tab === "reminders" && <div className="max-w-3xl"><Reminders e={e} /></div>}
        {tab === "signup" && <div className="max-w-3xl"><SignupSettings key={`s${e.signupKey}${e.signupOn}`} e={e} /></div>}
        {tab === "import" && <ImportTab e={e} />}
      </div>
    </div>
  );
}
