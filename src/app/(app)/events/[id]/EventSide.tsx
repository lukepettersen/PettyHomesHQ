"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { EventView } from "@/server/events";
import { EVENT_MERGE_FIELDS, reminderWhen, statusLabel, STATUS_KEYS } from "@/lib/events";
import { TimeSelect } from "../TimeSelect";
import { previewEventReminder, removeEventReminder, saveEventReminder, saveEventSignup, setEventSenderAction } from "../actions";

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Chicago" }) : "");

/** The private signup page: on/off, open and close dates, and its link (long and random; search engines are told to skip it). */
export function SignupSettings({ e }: { e: EventView }) {
  const router = useRouter();
  const [on, setOn] = useState(e.signupOn);
  const [opens, setOpens] = useState(day(e.signupOpensAt));
  const [closes, setCloses] = useState(day(e.signupClosesAt));
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [sure, setSure] = useState(false);
  const [origin, setOrigin] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => { const t = setTimeout(() => setOrigin(window.location.origin), 0); return () => clearTimeout(t); }, []);
  const link = e.signupKey && origin ? `${origin}/join/${e.signupKey}` : "";
  const dirty = on !== e.signupOn || opens !== day(e.signupOpensAt) || closes !== day(e.signupClosesAt);
  const save = (newLink = false) => start(async () => {
    setError(""); setMsg("");
    const r = await saveEventSignup(e.id, { on, opens, closes, newLink });
    if (!r.ok) { setError(r.error); return; }
    setMsg(newLink ? "New link made. The old link no longer works." : "Saved."); setSure(false); router.refresh();
  });
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setError("Couldn't copy; select the link and copy it."); } };
  return (
    <section className="card p-4" aria-labelledby="su-h">
      <h2 id="su-h" className="text-lg font-bold">Signup page</h2>
      <p className="text-sm muted">A private page people fill out to sign up. Only people with the link can open it; search engines skip it.</p>
      <label className="mt-2 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={on} onChange={(x) => setOn(x.target.checked)} />Page is on</label>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="label">Opens (optional)<input type="date" className="input mt-1" value={opens} onChange={(x) => setOpens(x.target.value)} /></label>
        <label className="label">Closes (optional)<input type="date" className="input mt-1" value={closes} onChange={(x) => setCloses(x.target.value)} /></label>
      </div>
      {link && (
        <div className="mt-2 flex items-center gap-2">
          <input className="input min-w-0 flex-1 text-xs" readOnly value={link} aria-label="Signup page link" onFocus={(x) => x.target.select()} />
          <button type="button" className="btn text-sm" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
          <a className="btn text-sm" href={link} target="_blank" rel="noreferrer">Open</a>
        </div>
      )}
      {!e.signupKey && <p className="mt-2 text-xs muted">Save to make the link.</p>}
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
      {msg && <p role="status" className="mt-2 text-sm text-accent">{msg}</p>}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {e.signupKey && <button type="button" className="btn text-sm" onBlur={() => setSure(false)} disabled={pending} onClick={() => (sure ? save(true) : setSure(true))}>{sure ? "Click again: old link stops working" : "New link"}</button>}
        <button type="button" className="btn btn-primary text-sm" disabled={pending || (!dirty && !!e.signupKey)} onClick={() => save()}>{pending ? "Saving…" : "Save"}</button>
      </div>
    </section>
  );
}

type Reminder = EventView["reminders"][number];
type Draft = { name: string; body: string; daysBefore: number; time: string; statuses: string[]; active: boolean; addOwner: boolean };
const blank: Draft = { name: "Reminder", body: "Hi {first_name}! Reminder: {event_name} is {event_date} at {event_time}. Questions? Text Luke at 612-702-0295.", daysBefore: 1, time: "10:00", statuses: ["confirmed", "sent"], active: true, addOwner: true };

function ReminderForm({ e, r, onDone }: { e: EventView; r: Reminder | null; onDone: () => void }) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(r ? { name: r.name, body: r.body, daysBefore: r.daysBefore, time: r.time, statuses: r.statuses, active: r.active, addOwner: r.addOwner } : blank);
  const [who, setWho] = useState("");
  const [preview, setPreview] = useState<{ text: string; missing: string[]; who: string } | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const look = () => start(async () => { setError(""); const p = await previewEventReminder(e.id, d.body, who || null); if (!p.ok) { setError(p.error); return; } setPreview(p.data!); });
  const save = () => start(async () => {
    setError("");
    const x = await saveEventReminder(e.id, r?.id ?? null, d);
    if (!x.ok) { setError(x.error); return; }
    onDone(); router.refresh();
  });
  const fields = [["first_name", "First name(s)"], ...EVENT_MERGE_FIELDS, ...e.fields.map((f) => [f.key, f.label])] as [string, string][];
  return (
    <div className="rounded-lg border border-misty bg-paper p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="label min-w-[8rem] flex-1">Name<input className="input mt-1" value={d.name} onChange={(x) => setD({ ...d, name: x.target.value })} /></label>
        <label className="label w-24">Days before<input type="number" min={0} max={60} className="input mt-1" value={d.daysBefore} onChange={(x) => setD({ ...d, daysBefore: Math.max(0, Math.min(60, Number(x.target.value) || 0)) })} /></label>
        <label className="label">At<TimeSelect value={d.time} onChange={(time) => setD({ ...d, time })} blank={null} from="08:00" to="20:00" step={30} /></label>
      </div>
      <label className="label mt-2 block">Text<textarea className="input mt-1 w-full text-sm" rows={4} value={d.body} onChange={(x) => { setD({ ...d, body: x.target.value }); setPreview(null); }} /></label>
      <p className="mt-1 text-xs muted">Fill-ins: {fields.map(([k, l], i) => <span key={k}>{i > 0 && " · "}<button type="button" className="rounded bg-sunken px-1 font-mono hover:bg-misty" title={l} onClick={() => setD({ ...d, body: `${d.body}{${k}}` })}>{`{${k}}`}</button></span>)}</p>
      <fieldset className="mt-2 text-sm"><legend className="font-semibold">Goes to people who are</legend>
        {STATUS_KEYS.map((k) => <label key={k} className="mr-3 inline-flex items-center gap-1"><input type="checkbox" checked={d.statuses.includes(k)} onChange={(x) => setD({ ...d, statuses: x.target.checked ? [...d.statuses, k] : d.statuses.filter((s) => s !== k) })} />{statusLabel(k, e.doneLabel)}</label>)}
      </fieldset>
      <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={d.addOwner} onChange={(x) => setD({ ...d, addOwner: x.target.checked })} />Include {e.ownerCell ? `${e.ownerCell.name}'s cell (${e.ownerCell.number})` : "the owner's cell"} as a group text, so their reply reaches {e.ownerCell?.name ?? "the owner"}&apos;s phone{!e.groupsOn && <span className="muted"> (group texts aren&apos;t set up, so it goes to the client only)</span>}</label>
      <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={d.active} onChange={(x) => setD({ ...d, active: x.target.checked })} />On (scheduled for everyone it applies to, including people added later)</label>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="label">Preview for<select className="input mt-1" value={who} onChange={(x) => { setWho(x.target.value); setPreview(null); }}>
          <option value="">The first attendee</option>
          {e.attendees.slice(0, 100).map((a) => { const s = e.slots.find((x) => x.id === a.slotId); return <option key={a.id} value={a.id}>{a.name}{e.multiSlot && s ? ` · ${s.title || e.name} ${s.date}` : ""}</option>; })}
        </select></label>
        <button type="button" className="btn text-sm" disabled={pending || !d.body.trim()} onClick={look}>Preview</button>
      </div>
      {preview && (
        <div className="mt-2 rounded-lg border border-misty bg-white p-2 text-sm">
          <p className="text-xs muted">As {preview.who} would get it:</p>
          <p className="mt-1 whitespace-pre-wrap">{preview.text}</p>
          {preview.missing.length > 0 && <p className="mt-1 text-xs text-[#9a6400]">Blank (nothing on file): {preview.missing.join(", ")}</p>}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={pending || !d.body.trim() || !d.statuses.length} onClick={save}>{pending ? "Saving…" : "Save and schedule"}</button>
      </div>
    </div>
  );
}

/** Reminder texts: each one is scheduled for every attendee it applies to (and new ones as they're added). */
export function Reminders({ e }: { e: EventView }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [sure, setSure] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const sender = e.senders.find((s) => s.id === e.senderId);
  const remove = (id: string) => start(async () => { const r = await removeEventReminder(e.id, id); if (!r.ok) setError(r.error); setSure(""); router.refresh(); });
  return (
    <section className="card p-4" aria-labelledby="rem-h">
      <div className="flex items-baseline justify-between">
        <h2 id="rem-h" className="text-lg font-bold">Reminder texts</h2>
        {editing === null && <button type="button" className="text-sm font-semibold text-accent hover:underline" onClick={() => setEditing("new")}>+ Add</button>}
      </div>
      <p className="text-sm muted">Sent automatically before each date. Everyone added later gets them too.</p>
      {e.senders.length > 0 && (
        <label className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold">Send from
          <select className="input w-auto py-1 font-normal" aria-label="Reminder texts send from" value={e.senderId ?? sender?.id ?? ""} disabled={pending}
            onChange={(x) => { const v = x.target.value; start(async () => { setError(""); const r = await setEventSenderAction(e.id, v); if (!r.ok) setError(r.error); router.refresh(); }); }}>
            {!e.senderId && <option value="">The owner&apos;s HQ number</option>}
            {e.senders.map((s) => <option key={s.id} value={s.id}>{s.name}&apos;s HQ number ({s.number})</option>)}
          </select>
          <span className="text-xs font-normal muted">Changing it moves every scheduled reminder to that number.</span>
        </label>
      )}
      <details className="mt-1 text-xs muted"><summary className="cursor-pointer">How they work</summary>
        <p className="mt-1">From {sender ? `${sender.number}` : "the owner's HQ number"}, 8am–8pm only. Each one shows in the contact&apos;s Scheduled box (turn one off there) and in Messages once sent. People who replied STOP, or with no textable number, are skipped.</p>
      </details>
      {editing === "new" && <div className="mt-2"><ReminderForm e={e} r={null} onDone={() => setEditing(null)} /></div>}
      <ul className="mt-2 space-y-2">
        {e.reminders.map((r) => editing === r.id ? <li key={r.id}><ReminderForm e={e} r={r} onDone={() => setEditing(null)} /></li> : (
          <li key={r.id} className="rounded-lg border border-misty p-2 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <b>{r.name}{!r.active && <span className="ml-1 text-xs font-normal muted">(off)</span>}</b>
              <span className="text-xs muted">{reminderWhen(r.daysBefore, r.time)}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-xs muted">{r.body}</p>
            <p className="mt-1 text-xs">{[r.pending ? `${r.pending} scheduled${r.next ? ` (next ${r.next})` : ""}` : "None scheduled", r.sent ? `${r.sent} sent` : "", r.failed ? `${r.failed} didn't send` : "", r.off ? `${r.off} turned off` : ""].filter(Boolean).join(" · ")}
              <span className="muted"> · to {r.statuses.map((s) => statusLabel(s, e.doneLabel).toLowerCase()).join(", ")}{r.addOwner && e.groupsOn && e.ownerCell ? `, with ${e.ownerCell.name}'s cell in the group` : ""}</span></p>
            <div className="mt-1 flex justify-end gap-2">
              <button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => setEditing(r.id)}>Edit</button>
              <button type="button" className="btn px-2 py-0.5 text-xs text-bad" disabled={pending} onBlur={() => setSure("")} onClick={() => (sure === r.id ? remove(r.id) : setSure(r.id))}>{sure === r.id ? "Click again" : "Remove"}</button>
            </div>
          </li>
        ))}
        {!e.reminders.length && editing === null && <li className="text-sm muted">No reminders yet.</li>}
      </ul>
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
    </section>
  );
}
