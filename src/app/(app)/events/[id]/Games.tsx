"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { EventView } from "@/server/events";
import { statusLabel } from "@/lib/events";
import { formatTime } from "@/lib/tasks";
import { AddPeople, AttendeeRow, ImportDates, SlotForm, useAction } from "./EventClient";
import { GameWaiting, ImportGoing } from "./Waitlist";
import { removeEventSlot } from "../actions";

type Slot = EventView["slots"][number];
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], MONS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const CHIP: Record<string, string> = { invited: "bg-sunken text-charcoal", confirmed: "bg-accent-soft text-accent", sent: "bg-[#e3ecf7] text-[#24507a]", declined: "bg-[#f7e2de] text-bad line-through" };
const coming = (s: string) => s === "confirmed" || s === "sent";

/** A calendar-page date: "MON / 23 / NOV". */
function DateBlock({ iso, past }: { iso: string; past: boolean }) {
  const [y, m, d] = iso.split("-").map(Number);
  return (
    <div className={`flex w-14 flex-none flex-col items-center rounded-lg border py-1 leading-tight ${past ? "border-misty bg-sunken text-muted" : "border-accent/30 bg-accent-soft text-accent"}`}>
      <span className="text-[10px] font-bold tracking-wider">{DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}</span>
      <span className="text-xl font-extrabold">{d}</span>
      <span className="text-[10px] font-bold tracking-wider">{MONS[m - 1]}</span>
    </div>
  );
}

type Filter = "upcoming" | "open" | "past" | "all";

/** Games tab (owner request 2026-11-22: friendlier Events page): who's going on each game at a glance, games needing
 *  people flagged, click a game to manage it. */
export function GamesTab({ e, today }: { e: EventView; today: string }) {
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState<"game" | "people" | null>(null);
  const people = useMemo(() => new Map(e.slots.map((s) => [s.id, e.attendees.filter((a) => a.slotId === s.id)])), [e]);
  const needs = (s: Slot) => s.date >= today && !(people.get(s.id) ?? []).some((a) => coming(a.status));
  const upcoming = e.slots.filter((s) => s.date >= today);
  const shown = e.slots.filter((s) => filter === "all" ? true : filter === "past" ? s.date < today : filter === "open" ? needs(s) : s.date >= today);
  const counts: Record<Filter, number> = { upcoming: upcoming.length, open: upcoming.filter(needs).length, past: e.slots.length - upcoming.length, all: e.slots.length };
  const labels: Record<Filter, string> = { upcoming: "Upcoming", open: "Need people", past: "Past", all: "All" };
  return (
    <section aria-label="Games">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Show">
          {(Object.keys(labels) as Filter[]).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
              className={`rounded-full border px-3 py-1 text-sm font-semibold ${filter === k ? "border-accent bg-accent text-white" : "border-misty bg-white hover:bg-sunken"}`}>
              {labels[k]} <span className={filter === k ? "text-white/80" : "muted"}>{counts[k]}</span>
            </button>
          ))}
        </div>
        <span className="flex gap-2">
          {upcoming.length > 1 && <button type="button" className="btn text-sm" onClick={() => setAdding(adding === "people" ? null : "people")}>Add someone to several games</button>}
          <button type="button" className="btn text-sm" onClick={() => setAdding(adding === "game" ? null : "game")}>+ Add game</button>
        </span>
      </div>
      {adding === "people" && <div className="mt-2"><AddPeople e={e} slotIds={upcoming.map((s) => s.id)} onDone={() => setAdding(null)} /></div>}
      {adding === "game" && <div className="mt-2"><SlotForm e={e} slot={null} onDone={() => setAdding(null)} /></div>}
      {!e.slots.length && <p className="card mt-3 p-5 text-sm">No games yet. Add them one at a time, or use the <b>Import</b> tab to load the schedule.</p>}
      <ul className="mt-3 flex flex-col gap-2">
        {shown.map((s) => {
          const rows = people.get(s.id) ?? [];
          const isOpen = open === s.id;
          const past = s.date < today;
          return (
            <li key={s.id} className={`card overflow-hidden ${isOpen ? "ring-2 ring-accent/40" : ""}`}>
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.id)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-sunken/60">
                <DateBlock iso={s.date} past={past} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <b className="text-base">{s.title || e.name}</b>
                    <span className="text-sm muted">{s.time ? formatTime(s.time) : "Time TBD"}{s.details ? ` · ${s.details}` : ""}</span>
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {rows.map((a) => <span key={a.id} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CHIP[a.status] ?? ""}`} title={statusLabel(a.status, e.doneLabel)}>{a.name}</span>)}
                    {!rows.length && !past && <span className="rounded-full bg-[#f6efd9] px-2 py-0.5 text-xs font-semibold text-[#7a5d12]">Needs people</span>}
                    {!rows.length && past && <span className="text-xs muted">Nobody</span>}
                    {rows.length > 0 && needs(s) && <span className="rounded-full bg-[#f6efd9] px-2 py-0.5 text-xs font-semibold text-[#7a5d12]">Nobody confirmed</span>}
                  </span>
                </span>
                <span aria-hidden="true" className={`text-lg muted transition-transform ${isOpen ? "rotate-90" : ""}`}>›</span>
              </button>
              {isOpen && <GamePanel e={e} slot={s} />}
            </li>
          );
        })}
      </ul>
      {e.slots.length > 0 && !shown.length && <p className="mt-3 text-sm muted">{filter === "open" ? "Every upcoming game has someone. 🎉" : "No games here."}</p>}
    </section>
  );
}

/** One game opened: who's going (status, answers), add people, who's still waiting; edit or remove the game. */
function GamePanel({ e, slot }: { e: EventView; slot: Slot }) {
  const { error, run } = useAction();
  const [mode, setMode] = useState<"" | "add" | "edit">("");
  const [sure, setSure] = useState(false);
  const rows = e.attendees.filter((a) => a.slotId === slot.id);
  return (
    <div className="border-t border-misty bg-paper p-3">
      {mode === "edit" ? <SlotForm e={e} slot={slot} onDone={() => setMode("")} /> : (
        <div className={`grid gap-4 ${e.waitlist.length ? "lg:grid-cols-2" : ""}`}>
          <div>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold">Going</h3>
              {mode !== "add" && <button type="button" className="btn btn-primary px-3 py-1 text-sm" onClick={() => setMode("add")}>+ Add people</button>}
            </div>
            {mode === "add" && <div className="mt-2"><AddPeople e={e} slotIds={[slot.id]} onDone={() => setMode("")} /></div>}
            {rows.length ? <ul className="divide-y divide-misty/60">{rows.map((a) => <AttendeeRow key={a.id} e={e} a={a} />)}</ul>
              : <p className="mt-1 text-sm muted">Nobody yet.{e.waitlist.some((w) => w.waiting) ? " Pick from the waiting list." : ""}</p>}
          </div>
          {e.waitlist.length > 0 && <div className="lg:border-l lg:border-misty lg:pl-4"><GameWaiting e={e} slot={slot} /></div>}
        </div>
      )}
      {mode !== "edit" && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-misty pt-2 text-sm">
          <span className="muted">{[slot.opponent, slot.location].filter(Boolean).join(" · ")}</span>
          <span className="flex gap-2">
            <button type="button" className="btn px-2 py-1 text-xs" onClick={() => setMode("edit")}>Edit game</button>
            <button type="button" className="btn px-2 py-1 text-xs text-bad" onBlur={() => setSure(false)} onClick={() => (sure ? run(() => removeEventSlot(e.id, slot.id)) : setSure(true))}>{sure ? "Click again to remove" : "Remove game"}</button>
          </span>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
    </div>
  );
}

/** Import tab: the schedule (NBA or spreadsheet) and who's going (season spreadsheet). */
export function ImportTab({ e }: { e: EventView }) {
  return (
    <section className="card p-4" aria-label="Import">
      <h2 className="text-lg font-bold">Import</h2>
      <p className="text-sm muted">Bring in the schedule and who&apos;s going. Importing again updates what&apos;s there, so nothing doubles.</p>
      <ImportDates e={e} open />
      {e.slots.length > 0 && <ImportGoing e={e} open />}
      <p className="mt-3 text-xs muted">Need a template? A spreadsheet with columns <b>Date, Opponent, Time, Assigned</b> (and optional <b>Interested</b> columns for the waitlist) works for both. <Link href="/events/templates" className="underline">Event templates</Link></p>
    </section>
  );
}
