"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatPhone } from "@/lib/normalize";
import type { InboundNote } from "@/server/textDebug";
import { saveDailyCap, saveTextLine, setGroupTexting, setRecordCalls } from "./actions";

type Twilio = { number: string; name: string; mms: boolean };
type Line = { userId: string; name: string; number: string | null; forwardTo: string | null };

/** Admin → Integrations → Texting: each team member's own number, call forwarding, and the daily limit. */
export function TextLines({ lines, cap, numbers, record, groups, groupSetUp, inbound }: { lines: Line[]; cap: number; numbers: Twilio[] | null; record: boolean; groups: boolean; groupSetUp: string[] | null; inbound: InboundNote[] }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider muted">Numbers</h3>
      {lines.map((l) => <LineRow key={l.userId} line={l} numbers={numbers} groupSetUp={groupSetUp} taken={lines.filter((o) => o.userId !== l.userId && o.number)} />)}
      <GroupRow on={groups} />
      {groups && inbound.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold muted">Recent incoming texts (troubleshooting)</summary>
          <ul className="mt-1 flex flex-col gap-0.5 font-mono">
            {inbound.map((n, i) => (
              <li key={i}>{new Date(n.at).toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit", second: "2-digit" }).replace(" ", "").toLowerCase()} · {n.via === "plain" ? "PLAIN" : `CONVERSATION${n.group ? " GROUP" : " 1:1"}`} · from …{n.from} to …{n.to}{n.people !== undefined ? ` · ${n.people} other people` : ""}{n.media ? " · media" : ""}{n.fields ? ` · ${n.fields.join(",")}` : ""}</li>
            ))}
          </ul>
        </details>
      )}
      <RecordRow on={record} />
      <CapRow cap={cap} />
    </div>
  );
}

function LineRow({ line, numbers, taken, groupSetUp }: { line: Line; numbers: Twilio[] | null; taken: Line[]; groupSetUp: string[] | null }) {
  const info = line.number ? numbers?.find((n) => n.number === line.number) : undefined;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [number, setNumber] = useState(line.number ?? "");
  const [cell, setCell] = useState(line.forwardTo ? formatPhone(line.forwardTo) : "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const cancel = () => { setEditing(false); setNumber(line.number ?? ""); setCell(line.forwardTo ? formatPhone(line.forwardTo) : ""); };
  const save = () => start(async () => {
    const r = await saveTextLine({ userId: line.userId, number, forwardTo: cell });
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setMsg({ ok: !r.data!.message.startsWith("Saved, but"), text: r.data!.message }); setEditing(false); router.refresh();
  });
  return (
    <div className="rounded-md border border-misty px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <b className="text-sm">{line.name}</b>
        {!editing && <button type="button" className="link text-sm" onClick={() => { setMsg(null); setEditing(true); }}>{line.number ? "Edit" : "Add number"}</button>}
      </div>
      {!editing ? (
        <>
        <p className="text-sm muted">{line.number ? <>Texts from <b className="text-charcoal">{formatPhone(line.number)}</b> · {line.forwardTo ? <>calls ring {formatPhone(line.forwardTo)}</> : "calls go to missed calls"}</> : "No texting number yet."}</p>
        {/* Group texts arrive as MMS; a number without it gets group messages as plain texts (owner 2026-10-22). */}
        {info && !info.mms && <p className="text-sm text-bad">This number can&apos;t get picture or group texts (MMS is off in Twilio), so group texts arrive as separate texts. Ask Twilio support to turn on MMS for it.</p>}
        {line.number && groupSetUp && !groupSetUp.includes(line.number) && <p className="text-sm text-bad">Group texting isn&apos;t set up on this number in Twilio. Turn Group texts off and on again.</p>}
        </>
      ) : (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {numbers ? (
            // A pick list of the Twilio account's numbers (owner request 2026-10-22); one taken by a teammate is marked.
            <label className="label">Texting number (from Twilio)
              <select className="input" value={number} onChange={(e) => setNumber(e.target.value)}>
                <option value="">No number</option>
                {line.number && !numbers.some((n) => n.number === line.number) && <option value={line.number}>{formatPhone(line.number)} (not in Twilio)</option>}
                {numbers.map((n) => {
                  const who = taken.find((o) => o.number === n.number);
                  return <option key={n.number} value={n.number} disabled={!!who}>{formatPhone(n.number)}{who ? ` (${who.name})` : ""}</option>;
                })}
              </select>
            </label>
          ) : (
            <label className="label">Texting number (from Twilio)<input className="input" inputMode="tel" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="952-243-7646" /></label>
          )}
          <label className="label">Forward calls to (cell)<input className="input" inputMode="tel" value={cell} onChange={(e) => setCell(e.target.value)} placeholder="Leave empty for missed calls only" /></label>
          <span className="flex gap-2 sm:col-span-2 sm:justify-end">
            <button type="button" className="btn" onClick={cancel}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</button>
          </span>
        </div>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-1 text-sm ${msg.ok ? "text-accent" : "text-bad"}`}>{msg.text}</p>}
    </div>
  );
}

function GroupRow({ on }: { on: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <button type="button" role="switch" aria-checked={on} aria-label="Group texts" disabled={pending}
        onClick={() => start(async () => { setMsg(null); const r = await setGroupTexting(!on); setMsg(r.ok ? { ok: true, text: r.data!.message } : { ok: false, text: r.error }); if (r.ok) router.refresh(); })}
        className={`relative h-6 w-11 flex-none rounded-full transition disabled:opacity-50 ${on ? "bg-accent" : "bg-rabbit"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-[22px]" : "left-0.5"}`} />
      </button>
      <span>{pending ? "Setting up in Twilio…" : on ? "Group texts stay together as one conversation, and replies go to everyone." : "Group texts are off: each person in a group shows as their own conversation."}</span>
      {msg && <span role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-accent" : "text-bad"}>{msg.text}</span>}
    </div>
  );
}

function RecordRow({ on }: { on: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <button type="button" role="switch" aria-checked={on} aria-label="Record answered calls" disabled={pending}
        onClick={() => start(async () => { setError(""); const r = await setRecordCalls(!on); if (!r.ok) setError(r.error); else router.refresh(); })}
        className={`relative h-6 w-11 flex-none rounded-full transition disabled:opacity-50 ${on ? "bg-accent" : "bg-rabbit"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-[22px]" : "left-0.5"}`} />
      </button>
      <span>{on ? <>Answered calls are recorded. Callers first hear &ldquo;This call may be recorded.&rdquo; Play them on the contact&apos;s timeline.</> : "Calls aren't recorded."}</span>
      {error && <span role="alert" className="text-bad">{error}</span>}
    </div>
  );
}

function CapRow({ cap }: { cap: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(cap));
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const changed = value !== String(cap);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-2">Daily limit per number
        <input type="number" min={1} max={5000} className="input w-24" value={value} onChange={(e) => { setValue(e.target.value); setMsg(""); }} /> texts</label>
      {changed && <>
        <button type="button" className="btn" onClick={() => setValue(String(cap))}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => start(async () => {
          const r = await saveDailyCap(Number(value));
          setMsg(r.ok ? "Saved." : r.error); if (r.ok) router.refresh();
        })}>Save</button>
      </>}
      {msg && <span role="status" className="muted">{msg}</span>}
      <span className="w-full text-xs muted">Texts you type send any time. Quiet hours (8am–8pm Central) hold only automatic texts.</span>
    </div>
  );
}
