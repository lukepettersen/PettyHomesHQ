"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EventView } from "@/server/events";
import { shortEventDate, statusLabel, STATUS_KEYS } from "@/lib/events";
import { normalizePhone } from "@/lib/normalize";
import { PeoplePicker, useAction, type Hit } from "./EventClient";
import { addEventAttendees, addToWaitlist, previewGameOffer, readAssignments, removeFromWaitlist, saveAssignments, sendGameOffer } from "../actions";

type Slot = EventView["slots"][number];
type Want = EventView["waitlist"][number];
const gameName = (e: EventView, id: string) => { const s = e.slots.find((x) => x.id === id); return s ? `${(s.title || e.name).replace(/^Wolves vs /, "")} ${shortEventDate(s.date)}` : ""; };
const textHref = (phone: string) => `/messages?n=${normalizePhone(phone)}`;

/** The waitlist tab ("Wants Wolves Tickets", owner request 2026-11-21; friendlier layout 2026-11-22): who wants
 *  tickets, still waiting first, with search. */
export function WaitlistCard({ e }: { e: EventView }) {
  const { error, pending, run } = useAction();
  const [adding, setAdding] = useState(false);
  const [people, setPeople] = useState<Hit[]>([]);
  const [show, setShow] = useState<"waiting" | "placed">("waiting");
  const [q, setQ] = useState("");
  const [sure, setSure] = useState("");
  const waiting = e.waitlist.filter((w) => w.waiting), placed = e.waitlist.filter((w) => !w.waiting);
  const list = (show === "waiting" ? waiting : placed).filter((w) => !q.trim() || `${w.name} ${w.note}`.toLowerCase().includes(q.trim().toLowerCase()));
  const label = e.waitlistLabel || "Waitlist";
  return (
    <section className="card p-4" aria-labelledby="wl-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="wl-h" className="text-lg font-bold">{label}</h2>
        {!adding && <button type="button" className="btn btn-primary text-sm" onClick={() => setAdding(true)}>+ Add people</button>}
      </div>
      <p className="text-sm muted">Signups land here. When someone gets a game (Confirmed or {e.doneLabel}) they move to &quot;Has a game&quot;{e.waitlistLabel ? `, and the "${e.waitlistLabel}" tag comes off` : ""}.</p>
      {adding && (
        <div className="mt-2 rounded-lg border border-misty bg-paper p-3">
          <PeoplePicker picked={people} onChange={setPeople} />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => { setAdding(false); setPeople([]); }}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={pending || !people.length} onClick={() => run(() => addToWaitlist(e.id, { personIds: people.map((p) => p.id) }), () => { setAdding(false); setPeople([]); })}>Add to list</button>
          </div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {([["waiting", `Waiting ${waiting.length}`], ["placed", `Has a game ${placed.length}`]] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)} className={`rounded-full border px-3 py-1 text-sm font-semibold ${show === k ? "border-accent bg-accent text-white" : "border-misty bg-white hover:bg-sunken"}`}>{l}</button>
        ))}
        <input className="input ml-auto w-full py-1 text-sm sm:w-56" aria-label="Find on the list" placeholder="Find a name" value={q} onChange={(x) => setQ(x.target.value)} />
      </div>
      <ul className="mt-2 divide-y divide-misty/60">
        {list.map((w) => (
          <li key={w.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
            <span className="min-w-[12rem] flex-1">
              <Link href={`/people/${w.personId}?from=events`} className="font-semibold hover:underline">{w.name}</Link>
              {w.note && <span className="ml-2 rounded-full bg-sunken px-2 py-0.5 text-xs">{w.note.replace(/ Clients? Interested$/i, " client")}</span>}
              {w.source === "signup" && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">signed up</span>}
              <span className="block text-xs muted">
                {[w.games.length ? `Has: ${w.games.map((id) => gameName(e, id)).join(", ")}` : "",
                  w.offered.length ? `Offered: ${w.offered.map((id) => gameName(e, id)).join(", ")}` : "",
                  w.slotIds.length ? `Would like: ${w.slotIds.map((id) => gameName(e, id)).filter(Boolean).join(", ")}` : "",
                  `on the list since ${shortEventDate(w.since)}`].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              {w.phone ? <Link href={textHref(w.phone)} className="btn px-2 py-0.5 text-xs" title={w.phone}>Text</Link> : <span className="text-xs muted" title="No textable number on their contact">No cell</span>}
              <button type="button" className="btn px-2 py-0.5 text-xs text-bad" onBlur={() => setSure("")} onClick={() => (sure === w.id ? run(() => removeFromWaitlist(e.id, w.id)) : setSure(w.id))}>{sure === w.id ? "Click again" : "Remove"}</button>
            </span>
          </li>
        ))}
      </ul>
      {!list.length && <p className="mt-2 text-sm muted">{q ? "No one by that name." : show === "waiting" ? "Nobody waiting." : "Nobody has a game yet."}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
    </section>
  );
}

/** On each game: who's still waiting (those who asked for this game first), to assign or text. */
export function GameWaiting({ e, slot }: { e: EventView; slot: Slot }) {
  const { error, pending, run } = useAction();
  const [offering, setOffering] = useState(false);
  const [all, setAll] = useState(false);
  const here = new Set(e.attendees.filter((a) => a.slotId === slot.id).map((a) => a.personId));
  const waiting = e.waitlist.filter((w) => w.waiting).sort((a, b) => Number(b.slotIds.includes(slot.id)) - Number(a.slotIds.includes(slot.id)));
  if (!e.waitlist.length) return null;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">Still waiting <span className="text-sm font-normal muted">{waiting.length}</span></h3>
        {waiting.length > 0 && !offering && <button type="button" className="btn text-xs" onClick={() => setOffering(true)}>Text them about this game</button>}
      </div>
      {offering && <OfferForm e={e} slot={slot} waiting={waiting} onDone={() => setOffering(false)} />}
      <ul className="divide-y divide-misty/60">
        {(all ? waiting : waiting.slice(0, 8)).map((w) => (
          <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-1 text-sm">
            <span>{w.slotIds.includes(slot.id) && <span title="Asked for this game" aria-label="Asked for this game">★ </span>}{w.name}
              {w.offered.includes(slot.id) && <span className="ml-1 text-xs text-[#9a6400]">offered</span>}
              {w.phone && <span className="ml-1 text-xs muted">{w.phone}</span>}</span>
            <span className="flex gap-1.5">
              {w.phone && <Link href={textHref(w.phone)} className="btn px-2 py-0.5 text-xs">Text</Link>}
              <button type="button" className="btn btn-primary px-2 py-0.5 text-xs" disabled={pending}
                onClick={() => run(() => addEventAttendees(e.id, { slotIds: [slot.id], personIds: [w.personId], status: "confirmed" }))}>{here.has(w.personId) ? "Confirm here" : "Assign"}</button>
            </span>
          </li>
        ))}
      </ul>
      {waiting.length > 8 && <button type="button" className="mt-1 text-sm font-semibold text-accent hover:underline" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${waiting.length}`}</button>}
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    </div>
  );
}

function OfferForm({ e, slot, waiting, onDone }: { e: EventView; slot: Slot; waiting: Want[]; onDone: () => void }) {
  const router = useRouter();
  const textable = waiting.filter((w) => w.phone);
  const [picked, setPicked] = useState<string[]>(textable.filter((w) => w.slotIds.includes(slot.id)).map((w) => w.personId));
  const [body, setBody] = useState(e.offerText || "Hi {first_name}! I have tickets for Wolves vs {opponent} on {event_date} at {event_time}. Want them? - Luke 612-702-0295");
  const [invite, setInvite] = useState(true);
  const [preview, setPreview] = useState<{ text: string; who: string; missing: string[] } | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();
  const look = () => start(async () => { setError(""); const r = await previewGameOffer(e.id, slot.id, picked[0] ?? null, body); if (!r.ok) { setError(r.error); return; } setPreview(r.data!); });
  const send = () => start(async () => {
    setError(""); setMsg("");
    const r = await sendGameOffer(e.id, slot.id, { personIds: picked, body, markInvited: invite });
    if (!r.ok) { setError(r.error); setSure(false); return; }
    setMsg(`${r.data!.queued} ${r.data!.queued === 1 ? "text" : "texts"} going out ${r.data!.when ? `at ${r.data!.when} (after hours now)` : "within a minute"}.${r.data!.skipped.length ? ` Skipped: ${r.data!.skipped.join(", ")}.` : ""}`);
    setSure(false); router.refresh();
  });
  return (
    <div className="mt-2 rounded-lg border border-misty bg-paper p-3 text-sm">
      <fieldset>
        <legend className="font-semibold">Text who? <button type="button" className="ml-2 text-xs font-semibold text-accent hover:underline" onClick={() => setPicked(textable.map((w) => w.personId))}>All {textable.length}</button>
          <button type="button" className="ml-2 text-xs font-semibold text-accent hover:underline" onClick={() => setPicked([])}>None</button></legend>
        <div className="mt-1 grid max-h-40 gap-1 overflow-auto sm:grid-cols-2">
          {textable.map((w) => <label key={w.id} className="flex items-center gap-1.5"><input type="checkbox" checked={picked.includes(w.personId)} onChange={(x) => { setPicked(x.target.checked ? [...picked, w.personId] : picked.filter((p) => p !== w.personId)); setSure(false); }} />{w.slotIds.includes(slot.id) ? "★ " : ""}{w.name}</label>)}
        </div>
        {waiting.length > textable.length && <p className="text-xs muted">{waiting.length - textable.length} without a textable number aren&apos;t listed.</p>}
      </fieldset>
      <label className="label mt-2 block">Text<textarea className="input mt-1 w-full" rows={3} value={body} onChange={(x) => { setBody(x.target.value); setPreview(null); setSure(false); }} /></label>
      <p className="text-xs muted">Fill-ins: {"{first_name} {opponent} {event_date} {event_time} {location} {seat_info} {slot_title}"}</p>
      <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={invite} onChange={(x) => setInvite(x.target.checked)} />Mark them Invited for this game (they stay on the waitlist until Confirmed)</label>
      {preview && <div className="mt-2 rounded-lg border border-misty bg-white p-2"><p className="text-xs muted">As {preview.who} would get it:</p><p className="whitespace-pre-wrap">{preview.text}</p></div>}
      {error && <p role="alert" className="mt-2 text-bad">{error}</p>}
      {msg && <p role="status" className="mt-2 text-accent">{msg}</p>}
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn" onClick={onDone}>Close</button>
        <button type="button" className="btn" disabled={pending || !body.trim()} onClick={look}>Preview</button>
        <button type="button" className="btn btn-primary" disabled={pending || !picked.length || !body.trim()} onBlur={() => setSure(false)} onClick={() => (sure ? send() : setSure(true))}>
          {pending ? "Sending…" : sure ? `Click again to text ${picked.length}` : `Send to ${picked.length}`}</button>
      </div>
    </div>
  );
}

type Row = { line: number; name: string; wait: string; slotId: string | null; game: string; candidates: { id: string; name: string; detail: string }[]; phone: string; email: string; seats: string; problem: string | null; pick: string };

/** Import who's going from the season spreadsheet: read it, check each name's contact, then save. */
export function ImportGoing({ e, open = false }: { e: EventView; open?: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [status, setStatus] = useState("confirmed");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const read = (f: File | undefined) => { if (!f) return; void f.text().then((csv) => start(async () => {
    setError(""); setMsg("");
    const r = await readAssignments(e.id, csv);
    if (!r.ok) { setError(r.error); return; }
    setSkipped(r.data!.skipped);
    // One match: picked. Several: you choose. None: a new contact.
    setRows(r.data!.rows.map((x) => ({ ...x, pick: x.problem ? "skip" : x.candidates.length === 1 ? x.candidates[0].id : x.candidates.length ? "" : "new" })));
  })); };
  const save = () => start(async () => {
    if (!rows) return;
    setError("");
    const items = rows.filter((r) => (r.slotId || r.wait) && r.pick && r.pick !== "skip").map((r) => ({ slotId: r.slotId, wait: r.wait, personId: r.pick === "new" ? null : r.pick, name: r.name, phone: r.phone, email: r.email, seats: r.seats }));
    const x = await saveAssignments(e.id, { status, items });
    if (!x.ok) { setError(x.error); return; }
    setMsg(`Saved: ${x.data!.added} added to games, ${x.data!.updated} updated, ${x.data!.waiting} onto the waitlist, ${x.data!.created} new contacts.`); setRows(null); router.refresh();
  });
  const undecided = rows?.filter((r) => r.pick === "").length ?? 0;
  return (
    <details open={open} className="mt-2 rounded-lg border border-misty px-3 py-2 text-sm">
      <summary className="cursor-pointer font-semibold">Who&apos;s going (season spreadsheet)</summary>
      <p className="mt-1 text-xs muted">A CSV with a <b>Date</b> column and the people (Name, Guest, Client, Who or Assigned; several names in a cell on separate lines or split by &quot;;&quot;). Optional: Opponent, Phone, Email, Seats. Columns named &quot;Interested&quot; or &quot;Waitlist&quot; go onto the waitlist. You check every name before anything is saved.</p>
      <input type="file" accept=".csv,text/csv" className="mt-1 block text-sm" disabled={pending} onChange={(x) => { read(x.target.files?.[0]); x.target.value = ""; }} />
      {rows && (
        <div className="mt-2">
          <p className="text-xs">{rows.length} names{skipped ? ` · ${skipped} rows without a date skipped` : ""}{undecided ? ` · ${undecided} need you to pick the contact` : ""}</p>
          <div className="mt-1 max-h-96 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className="muted"><th className="py-1 pr-2">Row</th><th className="pr-2">Game</th><th className="pr-2">Name in file</th><th>HQ contact</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-misty/60 align-top">
                    <td className="py-1 pr-2">{r.line}</td>
                    <td className="pr-2">{r.game}{r.problem && <span className="block text-bad">{r.problem}</span>}</td>
                    <td className="pr-2">{r.name}{r.seats && <span className="block muted">{r.seats}</span>}</td>
                    <td>
                      <select aria-label={`Contact for ${r.name}`} className={`input py-0.5 text-xs ${r.pick === "" ? "border-[#9a6400]" : ""}`} value={r.pick} disabled={!!r.problem} onChange={(x) => setRows(rows.map((y, j) => (j === i ? { ...y, pick: x.target.value } : y)))}>
                        {r.pick === "" && <option value="">Pick one…</option>}
                        {r.candidates.map((c) => <option key={c.id} value={c.id}>{c.name}{c.detail ? ` · ${c.detail}` : ""}</option>)}
                        <option value="new">New contact: {r.name}</option>
                        <option value="skip">Skip</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex flex-wrap items-end justify-end gap-2">
            <label className="label">Save people on games as<select className="input mt-1" value={status} onChange={(x) => setStatus(x.target.value)}>{STATUS_KEYS.map((k) => <option key={k} value={k}>{statusLabel(k, e.doneLabel)}</option>)}</select></label>
            <button type="button" className="btn" onClick={() => setRows(null)}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={pending || undecided > 0} onClick={save}>{pending ? "Saving…" : undecided ? `Pick ${undecided} contacts first` : "Save"}</button>
          </div>
        </div>
      )}
      {msg && <p role="status" className="mt-1 text-accent">{msg}</p>}
      {error && <p role="alert" className="mt-1 text-bad">{error}</p>}
    </details>
  );
}
