"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EventView } from "@/server/events";
import { gameLine, OFFER_MERGE_FIELDS, shortEventDate, statusLabel, STATUS_KEYS } from "@/lib/events";
import { normalizePhone } from "@/lib/normalize";
import { PeoplePicker, useAction, type Hit } from "./EventClient";
import { addEventAttendees, addToWaitlist, setWaitlistTier, previewGameOffer, readAssignments, removeFromWaitlist, saveAssignments, sendGameOffer } from "../actions";

type Slot = EventView["slots"][number];
type Want = EventView["waitlist"][number];
const gameName = (e: EventView, id: string) => { const s = e.slots.find((x) => x.id === id); return s ? `${(s.title || e.name).replace(/^Wolves vs /, "")} ${shortEventDate(s.date)}` : ""; };
const textHref = (phone: string) => `/messages?n=${normalizePhone(phone)}`;

const TIERS = ["A", "B", "C"] as const;
/** The list stacked by tier: A, B, C, then no tier. */
function groups(list: Want[]): [string, Want[]][] {
  return [...TIERS, ""].map((t) => [t, list.filter((w) => ((TIERS as readonly string[]).includes(w.tier) ? w.tier : "") === t)] as [string, Want[]]).filter(([, r]) => r.length);
}

/** The waitlist tab ("Wants Wolves Tickets", owner request 2026-11-21; friendlier layout 2026-11-22): who wants
 *  tickets, still waiting first, with search. */
export function WaitlistCard({ e }: { e: EventView }) {
  const { error, pending, run } = useAction();
  const [adding, setAdding] = useState(false);
  const [people, setPeople] = useState<Hit[]>([]);
  const [show, setShow] = useState<"waiting" | "placed">("waiting");
  const [q, setQ] = useState("");
  const [sure, setSure] = useState("");
  // Tick people, pick games, text them (owner request 2026-11-22: "text people from here").
  const [chosen, setChosen] = useState<string[]>([]);
  const [games, setGames] = useState<string[]>([]);
  const [writing, setWriting] = useState(false);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  // Only games still available: ahead, and nobody Confirmed or Tickets sent on them yet (owner 2026-11-22).
  const upcoming = e.slots.filter((s) => s.date >= today && !e.attendees.some((a) => a.slotId === s.id && (a.status === "confirmed" || a.status === "sent")));
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
      {show === "waiting" && waiting.length > 0 && (
        <div className={`mt-3 rounded-lg border p-3 text-sm ${chosen.length ? "border-accent/50 bg-accent-soft/40" : "border-misty bg-paper"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{chosen.length ? <b>{chosen.length} {chosen.length === 1 ? "person" : "people"} picked</b> : "Tick people below to text them about games."}</span>
            <span className="flex flex-wrap gap-2">
              {TIERS.filter((t) => waiting.some((w) => w.tier === t && w.phone)).map((t) => (
                <button key={t} type="button" className="btn px-2 py-1 text-xs" onClick={() => { setChosen([...new Set([...chosen, ...waiting.filter((w) => w.tier === t && w.phone).map((w) => w.personId)])]); setWriting(false); }}>+ All {t} ({waiting.filter((w) => w.tier === t && w.phone).length})</button>
              ))}
              <button type="button" className="btn px-2 py-1 text-xs" onClick={() => setChosen(waiting.filter((w) => w.phone).map((w) => w.personId))}>Everyone with a cell ({waiting.filter((w) => w.phone).length})</button>
              {chosen.length > 0 && <button type="button" className="btn px-2 py-1 text-xs" onClick={() => { setChosen([]); setWriting(false); }}>Clear</button>}
            </span>
          </div>
          {chosen.length > 0 && !writing && (
            <div className="mt-2">
              <p className="font-semibold">Which games are you offering? <span className="font-normal muted">({upcoming.length} still open)</span></p>
              <div className="mt-1 grid max-h-56 gap-1 overflow-auto sm:grid-cols-2">
                {upcoming.map((s) => <label key={s.id} className="flex items-center gap-1.5"><input type="checkbox" checked={games.includes(s.id)} onChange={(x) => setGames(x.target.checked ? [...games, s.id] : games.filter((g) => g !== s.id))} />{gameLine(s, e.name)}</label>)}
              </div>
              {!upcoming.length && <p className="text-xs muted">Every upcoming game already has someone.</p>}
              <div className="mt-2 flex justify-end"><button type="button" className="btn btn-primary text-sm" disabled={!games.length} onClick={() => setWriting(true)}>Next: write the text</button></div>
            </div>
          )}
          {chosen.length > 0 && writing && (
            <OfferForm key={`${chosen.join()}|${games.join()}`} e={e} slots={upcoming.filter((s) => games.includes(s.id))} waiting={waiting} people={chosen} onDone={() => setWriting(false)} />
          )}
        </div>
      )}
      {groups(list).map(([tier, rows]) => (
        <div key={tier || "none"} className="mt-3">
          <h3 className="flex items-center gap-2 border-b border-misty pb-1 text-sm font-bold">
            <span className={`grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs ${tier ? "bg-accent text-white" : "bg-sunken"}`}>{tier || "–"}</span>
            {tier ? `${tier} clients` : "No tier yet"} <span className="font-normal muted">{rows.length}</span>
          </h3>
          <ul className="divide-y divide-misty/60">
            {rows.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                {show === "waiting" && (
                  <input type="checkbox" className="h-5 w-5" aria-label={`Pick ${w.name}`} disabled={!w.phone} title={w.phone ? "Pick to text" : "No textable number"}
                    checked={chosen.includes(w.personId)} onChange={(x) => { setChosen(x.target.checked ? [...chosen, w.personId] : chosen.filter((c) => c !== w.personId)); setWriting(false); }} />
                )}
                <span className="min-w-[12rem] flex-1">
                  <Link href={`/people/${w.personId}?from=events`} className="font-semibold hover:underline">{w.name}</Link>
                  {w.note && <span className="ml-2 rounded-full bg-sunken px-2 py-0.5 text-xs">{w.note}</span>}
                  {w.source === "signup" && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">signed up</span>}
                  <span className="block text-xs muted">
                    {[w.games.length ? `Has: ${w.games.map((id) => gameName(e, id)).join(", ")}` : "",
                      w.offered.length ? `Offered: ${w.offered.map((id) => gameName(e, id)).join(", ")}` : "",
                      w.slotIds.length ? `Would like: ${w.slotIds.map((id) => gameName(e, id)).filter(Boolean).join(", ")}` : "",
                      `on the list since ${shortEventDate(w.since)}`].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <select aria-label={`Tier for ${w.name}`} className="rounded border border-misty bg-white px-1 py-0.5 text-xs font-semibold" value={w.tier} disabled={pending}
                    onChange={(x) => run(() => setWaitlistTier(e.id, w.id, x.target.value))}>
                    <option value="">No tier</option>{TIERS.map((t) => <option key={t} value={t}>{t} client</option>)}
                  </select>
                  {w.phone ? <Link href={textHref(w.phone)} className="btn px-2 py-0.5 text-xs" title={w.phone}>Text</Link> : <span className="text-xs muted" title="No textable number on their contact">No cell</span>}
                  <button type="button" className="btn px-2 py-0.5 text-xs text-bad" onBlur={() => setSure("")} onClick={() => (sure === w.id ? run(() => removeFromWaitlist(e.id, w.id)) : setSure(w.id))}>{sure === w.id ? "Click again" : "Remove"}</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
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
      {offering && <OfferForm e={e} slots={[slot]} waiting={waiting} onDone={() => setOffering(false)} />}
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

/** Exactly which numbers each text goes to (owner 2026-11-22: "how do I know both numbers get texted?"). */
function GoesTo({ e, ids, waiting, extra }: { e: EventView; ids: string[]; waiting: Want[]; extra: Hit[] }) {
  const rows = ids.map((id) => { const w = waiting.find((x) => x.personId === id); return w ? { id, name: w.name, phones: w.phones } : { id, name: extra.find((x) => x.id === id)?.name ?? "", phones: [] as string[] }; });
  return (
    <div className="mt-2 rounded-lg border border-misty bg-white p-2 text-xs">
      <p className="font-semibold">Goes to</p>
      <ul className="mt-1 space-y-0.5">
        {rows.map((r) => (
          <li key={r.id}><b>{r.name}</b>: {r.phones.length ? r.phones.join(" and ") : "their textable numbers"}
            {r.phones.length > 1 && <span className="muted"> {e.groupsOn ? "(one group text with both)" : "(each gets their own text)"}</span>}</li>
        ))}
      </ul>
      <p className="mt-1 muted">Office, fax and landline numbers are never texted.</p>
    </div>
  );
}

const DEFAULT_OFFER = "Hi {first_name}! Luke has Timberwolves tickets he'd love to share. Would you be interested in any of these games?\n\n{games}\n\nThey're free; we'd just need a good email to transfer them to you. - Luke 612-702-0295";

/**
 * Text one or more games to people (owner request 2026-11-22: tick several games, then who to text; {games} lists them,
 * "Wed, Jan 27 - Denver Nuggets - 8:30 PM"). People who asked for one of the games are ticked to start; anyone else can
 * be added. Goes from the sender's own HQ number.
 */
export function OfferForm({ e, slots, waiting, onDone, people }: { e: EventView; slots: Slot[]; waiting: Want[]; onDone: () => void; people?: string[] }) {
  const router = useRouter();
  const ids = slots.map((s) => s.id);
  const textable = waiting.filter((w) => w.phone).sort((a, b) => (a.tier || "Z").localeCompare(b.tier || "Z"));
  const wanted = (w: Want) => w.slotIds.some((id) => ids.includes(id));
  const [picked, setPicked] = useState<string[]>(people ?? textable.filter(wanted).map((w) => w.personId));
  const [extra, setExtra] = useState<Hit[]>([]);
  const [body, setBody] = useState(e.offerText || DEFAULT_OFFER);
  const mine = e.senders.find((x) => x.id === e.me);
  const [fromId, setFromId] = useState(mine?.id ?? e.senderId ?? e.senders[0]?.id ?? "");
  const [invite, setInvite] = useState(true);
  const [preview, setPreview] = useState<{ text: string; who: string; missing: string[] } | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();
  const everyone = [...new Set([...picked, ...extra.map((x) => x.id)])];
  const noList = slots.length > 1 && !body.includes("{games}");
  const look = () => start(async () => { setError(""); const r = await previewGameOffer(e.id, ids, everyone[0] ?? null, body, fromId || null); if (!r.ok) { setError(r.error); return; } setPreview(r.data!); });
  const send = () => start(async () => {
    setError(""); setMsg("");
    const r = await sendGameOffer(e.id, ids, { personIds: everyone, body, markInvited: invite, fromId: fromId || null });
    if (!r.ok) { setError(r.error); setSure(false); return; }
    setMsg(`${r.data!.queued} ${r.data!.queued === 1 ? "text" : "texts"} going out ${r.data!.when ? `at ${r.data!.when} (after hours now)` : "within a minute"}.${r.data!.skipped.length ? ` Skipped: ${r.data!.skipped.join(", ")}.` : ""}`);
    setSure(false); setExtra([]); router.refresh();
  });
  const senders = e.senders.filter((x) => x.id === e.me || x.id === e.senderId || e.meIsOwner);
  return (
    <div className="mt-2 rounded-lg border border-misty bg-paper p-3 text-sm">
      <p className="font-semibold">{slots.length === 1 ? "Offering 1 game" : `Offering ${slots.length} games`}</p>
      <ul className="mt-1 text-xs">{slots.map((s) => <li key={s.id}>• {gameLine(s, e.name)}</li>)}</ul>
      <fieldset className="mt-3">
        <legend className="font-semibold">Text who? <button type="button" className="ml-2 text-xs font-semibold text-accent hover:underline" onClick={() => setPicked(textable.map((w) => w.personId))}>All waiting ({textable.length})</button>
          <button type="button" className="ml-2 text-xs font-semibold text-accent hover:underline" onClick={() => setPicked([])}>None</button></legend>
        {textable.length > 0 ? (
          <div className="mt-1 grid max-h-48 gap-1 overflow-auto sm:grid-cols-2">
            {textable.map((w) => <label key={w.id} className="flex items-center gap-1.5" title={w.phones.join(", ")}><input type="checkbox" checked={picked.includes(w.personId)} onChange={(x) => { setPicked(x.target.checked ? [...picked, w.personId] : picked.filter((p) => p !== w.personId)); setSure(false); }} />{wanted(w) ? "★ " : ""}{w.name}{w.tier ? <span className="text-xs muted"> · {w.tier}</span> : null}
              <span className={`text-xs ${w.phones.length > 1 ? "font-semibold text-accent" : "muted"}`}> · {w.phones.length > 1 ? `${w.phones.length} numbers` : "1 number"}</span></label>)}
          </div>
        ) : <p className="mt-1 text-xs muted">Nobody on the waitlist has a textable number. Add people below.</p>}
        {waiting.length > textable.length && <p className="text-xs muted">{waiting.length - textable.length} on the waitlist without a textable number aren&apos;t listed.</p>}
        <div className="mt-2"><span className="text-xs font-semibold">Anyone else:</span><PeoplePicker picked={extra} onChange={(x) => { setExtra(x); setSure(false); }} /></div>
      </fieldset>
      <label className="label mt-3 block">Text<textarea className="input mt-1 w-full" rows={7} value={body} onChange={(x) => { setBody(x.target.value); setPreview(null); setSure(false); }} /></label>
      <p className="text-xs muted">Fill-ins: {OFFER_MERGE_FIELDS.map(([k, l], i) => <span key={k}>{i > 0 && " · "}<button type="button" className="rounded bg-sunken px-1 font-mono hover:bg-misty" title={l} onClick={() => setBody(`${body}{${k}}`)}>{`{${k}}`}</button></span>)} · {"{first_name}"}</p>
      {noList && (
        <p className="mt-1 rounded bg-[#f6efd9] px-2 py-1 text-xs text-[#7a5d12]">The text doesn&apos;t list the games. Put <b>{"{games}"}</b> where the list should go.
          <button type="button" className="ml-2 font-semibold underline" onClick={() => setBody(body.includes("\n\n") ? body.replace("\n\n", "\n\n{games}\n\n") : `${body}\n\n{games}`)}>Add it for me</button></p>
      )}
      <div className="mt-2 flex flex-wrap items-end gap-3">
        {senders.length > 1 && (
          <label className="label">Send from<select className="input mt-1" value={fromId} onChange={(x) => { setFromId(x.target.value); setPreview(null); }}>
            {senders.map((x) => <option key={x.id} value={x.id}>{x.id === e.me ? "My number" : `${x.name.split(" ")[0]}'s number`} ({x.number})</option>)}
          </select></label>
        )}
        <label className="flex items-center gap-2 pb-2"><input type="checkbox" checked={invite} onChange={(x) => setInvite(x.target.checked)} />Mark them Invited for {slots.length === 1 ? "this game" : "these games"}</label>
      </div>
      {preview && <div className="mt-2 rounded-lg border border-misty bg-white p-2"><p className="text-xs muted">As {preview.who} would get it:</p><p className="whitespace-pre-wrap">{preview.text}</p></div>}
      {everyone.length > 0 && <GoesTo e={e} ids={everyone} waiting={waiting} extra={extra} />}
      {error && <p role="alert" className="mt-2 text-bad">{error}</p>}
      {msg && <p role="status" className="mt-2 text-accent">{msg}</p>}
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn" onClick={onDone}>Close</button>
        <button type="button" className="btn" disabled={pending || !body.trim()} onClick={look}>Preview</button>
        <button type="button" className="btn btn-primary" disabled={pending || !everyone.length || !body.trim()} onBlur={() => setSure(false)} onClick={() => (sure ? send() : setSure(true))}>
          {pending ? "Sending…" : sure ? `Click again to text ${everyone.length}` : `Send to ${everyone.length}`}</button>
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
