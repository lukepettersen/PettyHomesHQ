"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { EventView } from "@/server/events";
import { answerSummary, longEventDate, shortEventDate, statusLabel, STATUS_KEYS } from "@/lib/events";
import { formatTime } from "@/lib/tasks";
import { FieldsEditor, fromDraft, toDraft, type FieldDraft } from "../FieldsEditor";
import { TimeSelect } from "../TimeSelect";
import { GameWaiting, ImportGoing } from "./Waitlist";
import { addEventAttendees, editEvent, editEventAttendee, importSlotCsv, importWolvesSchedule, removeEvent, removeEventAttendee, removeEventSlot, saveEventSlot } from "../actions";

type Slot = EventView["slots"][number];
type Attendee = EventView["attendees"][number];
const CHIP: Record<string, string> = { invited: "bg-sunken text-charcoal", confirmed: "bg-accent-soft text-accent", sent: "bg-[#e3ecf7] text-[#24507a]", declined: "bg-[#f7e2de] text-bad" };

export function useAction() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => start(async () => {
    setError("");
    const r = await fn();
    if (!r.ok) { setError(r.error ?? "Something went wrong."); return; }
    after?.(); router.refresh();
  });
  return { error, setError, pending, run };
}

/** The top of an event: its name and details (Edit), and Remove. */
/** One number in the header's summary strip. */
function Stat({ label, value, sub, tone = "" }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-misty bg-paper px-2.5 py-1.5 sm:px-3 sm:py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide muted">{label}</div>
      <div className={`truncate text-base font-extrabold sm:text-lg ${tone}`}>{value}</div>
      {sub && <div className="truncate text-xs muted">{sub}</div>}
    </div>
  );
}

export function EventHeader({ e, today }: { e: EventView; today: string }) {
  const router = useRouter();
  const { error, pending, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [sure, setSure] = useState(false);
  const [d, setD] = useState({ name: e.name, type: e.type, location: e.location, notes: e.notes, intro: e.intro, doneLabel: e.doneLabel, senderId: e.senderId ?? "", waitlistLabel: e.waitlistLabel, offerText: e.offerText, fields: e.fields.map(toDraft) as FieldDraft[] });
  const save = () => run(() => editEvent(e.id, { ...d, senderId: d.senderId || null, fields: d.fields.map(fromDraft) }), () => setEditing(false));
  const remove = () => run(() => removeEvent(e.id), () => router.push("/events"));
  return (
    <section className="card p-4" aria-labelledby="ev-h">
      <Link href="/events" className="text-sm font-semibold text-accent hover:underline">← Events</Link>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 id="ev-h" className="text-2xl font-extrabold">{e.name}</h1>
          <p className="text-sm muted">{[e.type, e.location, e.multiSlot ? `${e.slots.length} games` : e.slots[0] ? `${longEventDate(e.slots[0].date)}${e.slots[0].time ? ` · ${formatTime(e.slots[0].time)}` : ""}` : "No date yet"].filter(Boolean).join(" · ")}</p>
          {e.notes && <p className="mt-1 whitespace-pre-wrap text-sm">{e.notes}</p>}
        </div>
        <button type="button" className="btn text-sm" onClick={() => setEditing(!editing)}>{editing ? "Close" : "Edit details"}</button>
      </div>
      <Summary e={e} today={today} />
      {editing && (
        <div className="mt-3 border-t border-misty pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="label">Name<input className="input mt-1" value={d.name} onChange={(x) => setD({ ...d, name: x.target.value })} /></label>
            <label className="label">Kind of event<input className="input mt-1" value={d.type} onChange={(x) => setD({ ...d, type: x.target.value })} /></label>
            <label className="label">Location<input className="input mt-1" value={d.location} onChange={(x) => setD({ ...d, location: x.target.value })} /></label>
            <label className="label">&quot;Done&quot; is called<input className="input mt-1" value={d.doneLabel} onChange={(x) => setD({ ...d, doneLabel: x.target.value })} /></label>
            <label className="label sm:col-span-2">Reminder texts go from
              <select className="input mt-1" value={d.senderId} onChange={(x) => setD({ ...d, senderId: x.target.value })}>
                {e.senders.map((s) => <option key={s.id} value={s.id}>{s.name}&apos;s HQ number ({s.number})</option>)}
              </select>
            </label>
            <label className="label sm:col-span-2">Notes (just for you)<textarea className="input mt-1 w-full" rows={2} value={d.notes} onChange={(x) => setD({ ...d, notes: x.target.value })} /></label>
            {e.multiSlot && <label className="label">Waitlist name (also a tag on people waiting)<input className="input mt-1" value={d.waitlistLabel} onChange={(x) => setD({ ...d, waitlistLabel: x.target.value })} placeholder="Wants Wolves Tickets" /></label>}
            {e.multiSlot && <label className="label sm:col-span-2">Text offering a game to the waitlist<textarea className="input mt-1 w-full" rows={2} value={d.offerText} onChange={(x) => setD({ ...d, offerText: x.target.value })} /></label>}
            <label className="label sm:col-span-2">Signup page intro<textarea className="input mt-1 w-full" rows={2} value={d.intro} onChange={(x) => setD({ ...d, intro: x.target.value })} /></label>
          </div>
          <h3 className="mt-3 font-semibold">Signup questions</h3>
          <div className="mt-1"><FieldsEditor fields={d.fields} onChange={(fields) => setD({ ...d, fields })} /></div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-misty pt-3">
            <button type="button" className="btn text-sm text-bad" onBlur={() => setSure(false)} onClick={() => (sure ? remove() : setSure(true))}>{sure ? "Click again to remove the event" : "Remove event"}</button>
            <span className="flex gap-2">
              <button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</button>
            </span>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
    </section>
  );
}

/** At a glance: the next date, games that still need people, who's waiting, the signup page. */
function Summary({ e, today }: { e: EventView; today: string }) {
  const going = (id: string) => e.attendees.filter((a) => a.slotId === id && (a.status === "confirmed" || a.status === "sent")).length;
  const upcoming = e.slots.filter((s) => s.date >= today);
  const next = upcoming[0];
  const open = upcoming.filter((s) => !going(s.id)).length;
  const waiting = e.waitlist.filter((w) => w.waiting).length;
  const nextName = next ? shortDay(next.date) : "None";
  const nextWho = next && e.multiSlot ? `${(next.title || e.name).replace(/^Wolves /, "")} · ` : "";
  return (
    <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2">
      <Stat label={e.multiSlot ? "Next game" : "Date"} value={nextName} sub={next ? `${nextWho}${next.time ? formatTime(next.time) : "Time TBD"} · ${going(next.id)} going` : e.slots.length ? "All past" : "No date yet"} />
      {e.multiSlot
        ? <Stat label="Need people" value={`${open} of ${upcoming.length}`} sub="upcoming games" tone={open ? "text-[#9a6400]" : "text-accent"} />
        : <Stat label="Coming" value={String(next ? going(next.id) : e.attendees.filter((a) => a.status === "confirmed" || a.status === "sent").length)} sub={`${e.attendees.length} on the list`} />}
      {e.multiSlot
        ? <Stat label={e.waitlistLabel ? "Waiting" : "Waitlist"} value={String(waiting)} sub={e.waitlistLabel || "people"} />
        : <Stat label="Reminders" value={String(e.reminders.filter((r) => r.active).length)} sub={(() => { const n = e.reminders.reduce((t, r) => t + r.pending, 0); return `${n} ${n === 1 ? "text" : "texts"} scheduled`; })()} />}
      <Stat label="Signup page" value={e.signupOn ? "On" : "Off"} tone={e.signupOn ? "text-accent" : ""} sub={e.signupKey ? "link ready" : "no link yet"} />
    </div>
  );
}
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Mon Nov 23" */
export const shortDay = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${MONS[m - 1]} ${d}`; };

const emptySlot = { date: "", time: "", title: "", opponent: "", location: "", details: "" };
export function SlotForm({ e, slot, onDone }: { e: EventView; slot: Slot | null; onDone: () => void }) {
  const { error, pending, run } = useAction();
  const [s, setS] = useState(slot ? { date: slot.date, time: slot.time ?? "", title: slot.title, opponent: slot.opponent, location: slot.location, details: slot.details } : emptySlot);
  const save = () => run(() => saveEventSlot(e.id, slot?.id ?? null, { ...s, time: s.time || null }), onDone);
  return (
    <div className="rounded-lg border border-misty bg-paper p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="label">Date<input type="date" className="input mt-1" value={s.date} onChange={(x) => setS({ ...s, date: x.target.value })} /></label>
        <label className="label">Time<TimeSelect value={s.time} onChange={(time) => setS({ ...s, time })} /></label>
        {e.multiSlot && <label className="label">Title<input className="input mt-1" value={s.title} onChange={(x) => setS({ ...s, title: x.target.value })} placeholder="Wolves vs Lakers" /></label>}
        {e.multiSlot && <label className="label">Opponent<input className="input mt-1" value={s.opponent} onChange={(x) => setS({ ...s, opponent: x.target.value })} placeholder="Los Angeles Lakers" /></label>}
        <label className="label">Location<input className="input mt-1" value={s.location} onChange={(x) => setS({ ...s, location: x.target.value })} placeholder={e.location || "Where"} /></label>
        <label className="label">{e.multiSlot ? "Seats / ticket info" : "Details"}<input className="input mt-1" value={s.details} onChange={(x) => setS({ ...s, details: x.target.value })} placeholder={e.multiSlot ? "Sec 104, Row 3, Seats 5–6" : ""} /></label>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={pending || !s.date} onClick={save}>{pending ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}

/** Import the Timberwolves' home games (NBA schedule) or any dates from a spreadsheet. */
export function ImportDates({ e, open = false }: { e: EventView; open?: boolean }) {
  const { error, pending, run } = useAction();
  const [season, setSeason] = useState("2026-27");
  const [msg, setMsg] = useState("");
  const wolves = /wolves/i.test(`${e.name} ${e.type}`);
  const nba = () => run(async () => { const r = await importWolvesSchedule(e.id, season); if (r.ok) setMsg(`Imported: ${r.data!.added} games added, ${r.data!.updated} updated.`); return r; });
  const csv = (f: File | undefined) => { if (!f) return; void f.text().then((text) => run(async () => { const r = await importSlotCsv(e.id, text, wolves ? "Wolves" : ""); if (r.ok) setMsg(`Imported: ${r.data!.added} added, ${r.data!.updated} updated${r.data!.skipped ? `, ${r.data!.skipped} rows skipped (no date)` : ""}.`); return r; })); };
  return (
    <details open={open} className="mt-2 rounded-lg border border-misty px-3 py-2 text-sm">
      <summary className="cursor-pointer font-semibold">{wolves ? "Games (schedule)" : "Import dates"}</summary>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="label">Season<input className="input mt-1 w-28" value={season} onChange={(x) => setSeason(x.target.value)} /></label>
        <button type="button" className="btn" disabled={pending} onClick={nba}>{pending ? "Importing…" : "Import Timberwolves home games (NBA schedule)"}</button>
      </div>
      <label className="mt-3 block">Or upload a spreadsheet (CSV) with columns <b>Date, Time, Opponent, Location, Seats</b>:
        <input type="file" accept=".csv,text/csv" className="mt-1 block text-sm" disabled={pending} onChange={(x) => { csv(x.target.files?.[0]); x.target.value = ""; }} />
      </label>
      <p className="mt-1 text-xs muted">Importing again updates games already here (seats you typed stay), so nothing doubles.</p>
      {msg && <p role="status" className="mt-1 text-accent">{msg}</p>}
      {error && <p role="alert" className="mt-1 text-bad">{error}</p>}
    </details>
  );
}

export type Hit = { id: string; name: string; detail: string };
/** Find contacts and pick one or more (the same search as the top bar). */
export function PeoplePicker({ picked, onChange }: { picked: Hit[]; onChange: (h: Hit[]) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => { fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal }).then((r) => r.json()).then((d) => setHits(d.results ?? [])).catch(() => {}); }, 200);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);
  const shown = q.trim().length < 2 ? [] : hits.filter((h) => !picked.some((p) => p.id === h.id));
  return (
    <div className="relative">
      <div className="flex flex-wrap gap-1.5">
        {picked.map((p) => <span key={p.id} className="flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-sm font-semibold text-accent">{p.name}<button type="button" aria-label={`Remove ${p.name}`} className="px-0.5 hover:text-bad" onClick={() => onChange(picked.filter((x) => x.id !== p.id))}>×</button></span>)}
      </div>
      <input className="input mt-1 w-full" aria-label="Find a contact" placeholder="Find a contact by name, phone or email" value={q} onChange={(x) => setQ(x.target.value)} />
      {shown.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-misty bg-white shadow-lg">
          {shown.map((h) => <li key={h.id}><button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-sunken" onClick={() => { onChange([...picked, h]); setQ(""); setHits([]); }}><b>{h.name}</b> <span className="muted">{h.detail}</span></button></li>)}
        </ul>
      )}
    </div>
  );
}

export function AddPeople({ e, slotIds, onDone }: { e: EventView; slotIds: string[]; onDone: () => void }) {
  const { error, pending, run } = useAction();
  const [people, setPeople] = useState<Hit[]>([]);
  const [status, setStatus] = useState("invited");
  const [games, setGames] = useState<string[]>(slotIds);
  const add = () => run(() => addEventAttendees(e.id, { slotIds: games, personIds: people.map((p) => p.id), status }), onDone);
  return (
    <div className="rounded-lg border border-misty bg-paper p-3">
      <PeoplePicker picked={people} onChange={setPeople} />
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="label">Status<select className="input mt-1" value={status} onChange={(x) => setStatus(x.target.value)}>{STATUS_KEYS.map((k) => <option key={k} value={k}>{statusLabel(k, e.doneLabel)}</option>)}</select></label>
        {e.multiSlot && games.length > 0 && <span className="pb-2 text-sm muted">{games.length === 1 ? "This game" : `${games.length} games`}</span>}
      </div>
      {e.multiSlot && slotIds.length > 1 && (
        <details className="mt-2 text-sm"><summary className="cursor-pointer">Pick games ({games.length})</summary>
          <div className="mt-1 grid max-h-48 gap-1 overflow-auto sm:grid-cols-2">
            {e.slots.filter((s) => slotIds.includes(s.id)).map((s) => <label key={s.id} className="flex items-center gap-1.5"><input type="checkbox" checked={games.includes(s.id)} onChange={(x) => setGames(x.target.checked ? [...games, s.id] : games.filter((g) => g !== s.id))} />{s.title || e.name} {shortEventDate(s.date)}</label>)}
          </div>
        </details>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={pending || !people.length || !games.length} onClick={add}>{pending ? "Adding…" : people.length === 1 ? "Add 1 person" : `Add ${people.length || ""} people`.replace("  ", " ")}</button>
      </div>
    </div>
  );
}

export function AttendeeRow({ e, a }: { e: EventView; a: Attendee }) {
  const { error, pending, run } = useAction();
  const [edit, setEdit] = useState(false);
  const [answers, setAnswers] = useState(a.answers);
  const [sure, setSure] = useState(false);
  const summary = answerSummary(e.fields, a.answers);
  const long = e.fields.filter((f) => (f.type === "long" || f.type === "text") && a.answers[f.key] && !summary.includes(a.answers[f.key]));
  return (
    <li className="py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0">
          <Link href={`/people/${a.personId}?from=events`} className="font-semibold hover:underline">{a.name}</Link>
          {summary && <span className="ml-2 text-sm">{summary}</span>}
          {a.source === "signup" && <span className="ml-2 text-xs muted">signed up</span>}
          {!a.phone && <span className="ml-2 text-xs text-[#9a6400]">no textable number</span>}
          {long.map((f) => <span key={f.key} className="block text-xs muted">{f.label}: {a.answers[f.key]}</span>)}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <select aria-label={`Status for ${a.name}`} className={`rounded-full border-0 px-2 py-0.5 text-xs font-semibold ${CHIP[a.status] ?? ""}`} value={a.status} disabled={pending}
            onChange={(x) => run(() => editEventAttendee(e.id, a.id, { status: x.target.value, answers: a.answers }))}>
            {STATUS_KEYS.map((k) => <option key={k} value={k}>{statusLabel(k, e.doneLabel)}</option>)}
          </select>
          {e.fields.length > 0 && <button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => setEdit(!edit)}>Answers</button>}
          <button type="button" className="btn px-2 py-0.5 text-xs text-bad" onBlur={() => setSure(false)} onClick={() => (sure ? run(() => removeEventAttendee(e.id, a.id)) : setSure(true))}>{sure ? "Click again" : "Remove"}</button>
        </span>
      </div>
      {edit && (
        <div className="mt-2 grid gap-2 rounded-lg border border-misty bg-paper p-2 sm:grid-cols-2">
          {e.fields.map((f) => (
            <label key={f.key} className={`label ${f.type === "long" ? "sm:col-span-2" : ""}`}>{f.label}
              {f.type === "select" ? <select className="input mt-1" value={answers[f.key] ?? ""} onChange={(x) => setAnswers({ ...answers, [f.key]: x.target.value })}><option value="">—</option>{f.options.map((o) => <option key={o}>{o}</option>)}</select>
                : f.type === "long" ? <textarea className="input mt-1 w-full" rows={2} value={answers[f.key] ?? ""} onChange={(x) => setAnswers({ ...answers, [f.key]: x.target.value })} />
                : <input className="input mt-1" inputMode={f.type === "number" ? "numeric" : undefined} value={answers[f.key] ?? ""} onChange={(x) => setAnswers({ ...answers, [f.key]: x.target.value })} />}
            </label>
          ))}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="btn text-sm" onClick={() => { setAnswers(a.answers); setEdit(false); }}>Cancel</button>
            <button type="button" className="btn btn-primary text-sm" disabled={pending} onClick={() => run(() => editEventAttendee(e.id, a.id, { status: a.status, answers }), () => setEdit(false))}>Save</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    </li>
  );
}

export function Attendees({ e, slot }: { e: EventView; slot: Slot }) {
  const [adding, setAdding] = useState(false);
  const rows = e.attendees.filter((a) => a.slotId === slot.id);
  const count = (k: string) => rows.filter((a) => a.status === k).length;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm muted">{rows.length ? STATUS_KEYS.filter((k) => count(k)).map((k) => `${count(k)} ${statusLabel(k, e.doneLabel).toLowerCase()}`).join(" · ") : "Nobody yet"}</span>
        {!adding && <button type="button" className="btn text-sm" onClick={() => setAdding(true)}>+ Add people</button>}
      </div>
      {adding && <div className="mt-2"><AddPeople e={e} slotIds={[slot.id]} onDone={() => setAdding(false)} /></div>}
      <ul className="divide-y divide-misty/60">{rows.map((a) => <AttendeeRow key={a.id} e={e} a={a} />)}</ul>
      {e.multiSlot && <GameWaiting e={e} slot={slot} />}
    </div>
  );
}

/** One date (Pi Day): its date and the people. Many dates (games): the schedule, each game opening to its people. */
export function EventSlots({ e, today }: { e: EventView; today: string }) {
  const { error, run } = useAction();
  const [editing, setEditing] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [sure, setSure] = useState("");
  const [bulk, setBulk] = useState(false);
  const counts = useMemo(() => new Map(e.slots.map((s) => [s.id, e.attendees.filter((a) => a.slotId === s.id && a.status !== "declined").length])), [e]);

  if (!e.multiSlot) {
    const s = e.slots[0];
    return (
      <section className="card p-4" aria-labelledby="ppl-h">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="ppl-h" className="text-lg font-bold">People</h2>
          {s && editing !== s.id && <button type="button" className="text-sm font-semibold text-accent hover:underline" onClick={() => setEditing(s.id)}>Change date</button>}
        </div>
        {s && editing === s.id && <div className="mt-2"><SlotForm e={e} slot={s} onDone={() => setEditing(null)} /></div>}
        {!s && <div className="mt-2"><p className="text-sm muted">Set the date first.</p><SlotForm e={e} slot={null} onDone={() => undefined} /></div>}
        {s && <div className="mt-2"><Attendees e={e} slot={s} /></div>}
      </section>
    );
  }
  const shown = e.slots.filter((s) => showPast || s.date >= today);
  const past = e.slots.length - e.slots.filter((s) => s.date >= today).length;
  return (
    <section className="card p-4" aria-labelledby="games-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="games-h" className="text-lg font-bold">Dates <span className="text-sm font-normal muted">{e.slots.length}</span></h2>
        <span className="flex gap-3 text-sm">
          {past > 0 && <button type="button" className="font-semibold text-accent hover:underline" onClick={() => setShowPast(!showPast)}>{showPast ? "Hide past" : `Show past (${past})`}</button>}
          {e.slots.length > 1 && <button type="button" className="font-semibold text-accent hover:underline" onClick={() => setBulk(!bulk)}>Add someone to several</button>}
          <button type="button" className="font-semibold text-accent hover:underline" onClick={() => setEditing("new")}>+ Add date</button>
        </span>
      </div>
      {bulk && <div className="mt-2"><AddPeople e={e} slotIds={e.slots.filter((s) => s.date >= today).map((s) => s.id)} onDone={() => setBulk(false)} /></div>}
      {editing === "new" && <div className="mt-2"><SlotForm e={e} slot={null} onDone={() => setEditing(null)} /></div>}
      <ImportDates e={e} />
      {e.slots.length > 0 && <ImportGoing e={e} />}
      {!e.slots.length && <p className="mt-2 text-sm muted">No dates yet. Add them one at a time, or import them.</p>}
      <ul className="mt-2 divide-y divide-misty">
        {shown.map((s) => (
          <li key={s.id} className="py-2">
            {editing === s.id ? <SlotForm e={e} slot={s} onDone={() => setEditing(null)} /> : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button type="button" className="min-w-0 text-left" aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? null : s.id)}>
                    <b>{s.title || e.name}</b> <span className="text-sm">{longEventDate(s.date)}{s.time ? ` · ${formatTime(s.time)}` : " · time TBD"}</span>
                    {s.details && <span className="block text-xs muted">{s.details}</span>}
                  </button>
                  <span className="flex items-center gap-2 text-sm">
                    <span className={counts.get(s.id) ? "font-semibold" : "muted"}>{counts.get(s.id) ?? 0} going</span>
                    <button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? "Close" : "People"}</button>
                    <button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => setEditing(s.id)}>Edit</button>
                    <button type="button" className="btn px-2 py-0.5 text-xs text-bad" onBlur={() => setSure("")} onClick={() => (sure === s.id ? run(() => removeEventSlot(e.id, s.id)) : setSure(s.id))}>{sure === s.id ? "Click again" : "✕"}</button>
                  </span>
                </div>
                {open === s.id && <div className="mt-2 rounded-lg border border-misty p-3"><Attendees e={e} slot={s} /></div>}
              </>
            )}
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
    </section>
  );
}
