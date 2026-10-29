"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { requestCompose } from "./compose";
import { addTimelineEntry, deleteTimelineEntry, editTimelineEntry } from "../actions";
import { mentionLabel, mentionQuery, splitMentions, type Member } from "@/lib/mentions";

type Entry = { id: string; kind: string; body: string; outcome: string | null; author: string | null; at: string; opened?: string | null; audio?: string; editable?: boolean };
const TABS: [Kind, string, string, string][] = [
  ["note", "Note", "Add a note.", "Save note"],
  ["send", "Send text", "", ""],
  ["text", "Log text", "What did you text them? For texts sent from your own phone.", "Log text"],
  ["call", "Log call", "What did you talk about?", "Log call"],
  ["email", "Email", "", ""],
];
type Kind = "note" | "send" | "text" | "call" | "email";
// The row shows Note, Log text and Log call; Send text and Email open from the contact card's buttons (owner 2026-10-28).
const ROW = TABS.filter(([k]) => k !== "send" && k !== "email");

const KIND_LABEL: Record<string, string> = { note: "Note", text: "Text", call: "Call", email: "Email", system: "Update", task: "Task done" };
const FILTERS: [string, string][] = [["all", "All"], ["note", "Notes"], ["email", "Emails"], ["text", "Texts"], ["call", "Calls"], ["task", "Tasks"]];
type EmailProps = { emails: string[]; templates: { id: string; name: string }[]; sendsFrom: string | null; ownGmail?: boolean; canConnect?: boolean };
type TextProps = { phones: string[]; templates: { id: string; name: string }[]; from: string | null; blocked: string | null };

export function Timeline({ personId, personName, entries, team, startOpen = false }: { personId: string; personName: string; entries: Entry[]; team: Member[]; email?: EmailProps; text?: TextProps; startOpen?: boolean }) {
  const [kind, setKind] = useState<Kind>("note");
  // The composer stays folded until a button is tapped, so the timeline starts higher (owner request 2026-10-28).
  // Someone with no buyer/seller file lands on the Timeline with Note open, ready to type (owner request 2026-10-29).
  const [open, setOpen] = useState(startOpen);
  const [body, setBody] = useState("");
  const [outcome, setOutcome] = useState("Talked");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pick, setPick] = useState<{ q: string; i: number } | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const [pending, start] = useTransition();
  const matches = pick ? team.filter((m) => m.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(pick.q.toLowerCase()))) : [];

  // Typing "@" shows the team; picking one inserts "@Alyssa" (SPEC.md §6.3).
  function onType(value: string, caret: number) {
    setBody(value);
    const q = mentionQuery(value.slice(0, caret));
    setPick(q === null ? null : { q, i: 0 });
  }
  function insert(m: Member) {
    const el = box.current;
    const caret = el?.selectionStart ?? body.length;
    const before = body.slice(0, caret).replace(/@\w*$/, `${mentionLabel(m)} `);
    const next = before + body.slice(caret);
    setBody(next); setPick(null);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(before.length, before.length); });
  }
  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!pick || !matches.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setPick({ ...pick, i: (pick.i + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length }); }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insert(matches[Math.min(pick.i, matches.length - 1)]); }
    else if (e.key === "Escape") { e.preventDefault(); setPick(null); }
  }
  const router = useRouter();
  const tab = TABS.find((t) => t[0] === kind)!;
  const shown = entries.filter((e) => filter === "all" || e.kind === filter);

  function save() {
    setError("");
    start(async () => {
      if (kind === "email" || kind === "send") return;
      const r = await addTimelineEntry({ personId, kind, body, outcome: kind === "call" ? outcome : undefined });
      if (!r.ok) { setError(r.error); return; }
      const names = r.data?.mentioned ?? [];
      setNotice(names.length ? `Saved. ${names.join(" and ")} will see it in their notifications.` : "");
      setBody(""); setPick(null); router.refresh();
    });
  }

  return (
    <div className="card mt-3 p-4" ref={top}>
      <div className="flex flex-wrap items-center gap-1">
        {ROW.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={open && kind === k} aria-expanded={open && kind === k} onClick={() => { if (open && kind === k) setOpen(false); else { setKind(k); setOpen(true); } }}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${open && kind === k ? "border border-misty bg-white" : "muted hover:text-charcoal"}`}>{label}</button>
        ))}
        {open && <button type="button" className="ml-auto text-xs font-semibold text-accent hover:underline" onClick={() => setOpen(false)}>Close</button>}
      </div>
      {open && <>
      {kind === "call" && (
        <select className="input mt-2 w-auto" value={outcome} onChange={(e) => setOutcome(e.target.value)} aria-label="Call outcome">
          <option>Talked</option><option>Left voicemail</option><option>No answer</option>
        </select>
      )}
      {kind !== "email" && kind !== "send" && <><div className="relative">
        <textarea ref={box} className="input mt-2 min-h-24" value={body} placeholder={`${tab[2]} Type @ to mention a teammate.`} aria-label={tab[1]}
          aria-controls={pick && matches.length ? "mention-list" : undefined}
          onChange={(e) => onType(e.target.value, e.target.selectionStart)} onKeyDown={onKey} onBlur={() => setTimeout(() => setPick(null), 150)} />
        {pick && matches.length > 0 && (
          <ul id="mention-list" role="listbox" aria-label="Mention a teammate" className="absolute left-2 top-full z-20 mt-1 w-56 rounded-lg border border-misty bg-white p-1 shadow-xl">
            {matches.map((m, i) => (
              <li key={m.id} role="option" aria-selected={i === pick.i}>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); insert(m); }} className={`w-full rounded-md px-2.5 py-1.5 text-left text-sm ${i === pick.i ? "bg-accent-soft font-semibold text-accent" : "hover:bg-sunken"}`}>{m.name}</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs muted">Emails sent from HQ show here. Replies stay in Gmail for now.</span>
        <button type="button" className="btn btn-primary" disabled={pending || !body.trim()} onClick={save}>{pending ? "Saving…" : tab[3]}</button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
      {notice && <p role="status" className="mt-2 text-sm text-accent">{notice}</p>}</>}
      </>}

      <div className="mt-4 flex flex-wrap gap-1.5">
        {FILTERS.map(([k, l]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${filter === k ? "border-charcoal bg-charcoal text-white" : "border-misty bg-white"}`}>
            {l} <span className="opacity-70">{k === "all" ? entries.length : entries.filter((e) => e.kind === k).length}</span>
          </button>
        ))}
      </div>
      {shown.length ? (
        <ol className="relative isolate mt-3">
          {threads(shown).map((g) => (
            <TimelineItem key={g[0].id} items={g} personName={personName} team={team} editing={editing} setEditing={setEditing} onChanged={() => router.refresh()}
              onReply={(subject) => requestCompose("email", /^re:/i.test(subject) ? subject : `Re: ${subject}`)} />
          ))}
        </ol>
      ) : <p className="mt-3 text-sm muted">Nothing here yet.</p>}
    </div>
  );
}

/** Edit a note, logged call or logged text in place: Save / Cancel (SPEC.md §5 save rule). */
function EditEntry({ entry, onDone }: { entry: Entry; onDone: () => void }) {
  const [body, setBody] = useState(entry.body);
  const [outcome, setOutcome] = useState(entry.outcome ?? "Talked");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      {entry.kind === "call" && (
        <select className="input w-auto self-start" value={outcome} onChange={(e) => setOutcome(e.target.value)} aria-label="Call outcome">
          {["Talked", "Left voicemail", "No answer"].map((o) => <option key={o}>{o}</option>)}
        </select>
      )}
      <textarea autoFocus aria-label="Edit entry" className="input min-h-24 font-normal" value={body} onChange={(e) => setBody(e.target.value)} />
      <span className="flex gap-2">
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={pending || !body.trim()} onClick={() => start(async () => {
          const r = await editTimelineEntry({ id: entry.id, body, outcome: entry.kind === "call" ? outcome : undefined });
          if (!r.ok) setError(r.error); else onDone();
        })}>{pending ? "Saving…" : "Save"}</button>
      </span>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    </div>
  );
}

/** Delete with a second click to confirm. */
function DeleteEntry({ id, onDone }: { id: string; onDone: () => void }) {
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();
  return (
    <button type="button" className="font-semibold text-bad hover:underline" disabled={pending} onBlur={() => setSure(false)}
      onClick={() => { if (!sure) { setSure(true); return; } start(async () => { const r = await deleteTimelineEntry(id); if (r.ok) onDone(); }); }}>
      {sure ? "Click again to delete" : "Delete"}
    </button>
  );
}

// ---------- Timeline items, threaded like FUB (owner request 2026-10-28) ----------
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).replace(/ (AM|PM)$/, (m) => m.trim().toLowerCase());
const initials = (name: string) => name.split(/\s+/).filter((w) => /[A-Za-z]/.test(w[0] ?? "")).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
const THREAD_GAP = 12 * 3600 * 1000;

/** Texts back and forth close together (within 12 hours, nothing else between) become one thread; everything else stands alone. */
function threads(list: Entry[]): Entry[][] {
  const out: Entry[][] = [];
  for (const e of list) {
    const last = out[out.length - 1];
    const prev = last?.[last.length - 1];
    if (e.kind === "text" && prev?.kind === "text" && Math.abs(new Date(prev.at).getTime() - new Date(e.at).getTime()) <= THREAD_GAP) last.push(e);
    else out.push([e]);
  }
  return out;
}

const ICON: Record<string, { bg: string; path: string }> = {
  email: { bg: "bg-[#dfeaf3] text-[#3f6f93]", path: "M4 6h16v12H4z M4 7l8 6 8-6" },
  text: { bg: "bg-accent-soft text-accent", path: "M5 5h14v10H9l-4 4z" },
  call: { bg: "bg-[#f6e3d9] text-[#9a4f2e]", path: "M6 3h3l2 5-2 1a11 11 0 0 0 6 6l1-2 5 2v3a2 2 0 0 1-2 2A17 17 0 0 1 4 5a2 2 0 0 1 2-2" },
  note: { bg: "bg-[#fbefd6] text-[#9a6400]", path: "M6 3h9l3 3v15H6z M9 10h6 M9 14h6" },
  task: { bg: "bg-accent-soft text-accent", path: "M5 12l4 4 10-10" },
  system: { bg: "bg-sunken text-muted", path: "M12 7v6 M12 16v.5 M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18" },
};

function KindDot({ kind, count }: { kind: string; count?: number }) {
  const ic = ICON[kind] ?? ICON.system;
  return (
    <span className={`relative z-[1] grid h-9 w-9 flex-none place-items-center rounded-full ${ic.bg}`} aria-hidden="true">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={ic.path} /></svg>
      {count && count > 1 ? <span className="absolute -bottom-1 -right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-charcoal px-1 text-[10px] font-bold text-white">{count}</span> : null}
    </span>
  );
}

/** Who sent it and to whom: "Alyssa Chakiton › Jewel Coughlin". */
function who(e: Entry, personName: string): { from: string; to: string } {
  if (e.kind === "email") {
    const head = e.body.split("\n\n")[0];
    const m = /^(To|From) (.*?) · /.exec(head);
    if (m?.[1] === "From") return { from: personName, to: e.author ?? "" };
    return { from: e.author ?? "HQ", to: m ? `${personName} (${m[2]})` : personName };
  }
  if (e.kind === "text") return e.outcome === "Received" ? { from: personName, to: e.author ?? "" } : { from: e.author ?? "You", to: personName };
  return { from: e.author ?? (e.kind === "system" || e.kind === "task" ? "HQ" : personName), to: "" };
}

function TimelineItem({ items, personName, team, editing, setEditing, onChanged, onReply }: {
  items: Entry[]; personName: string; team: Member[]; editing: string | null; setEditing: (id: string | null) => void; onChanged: () => void; onReply: (subject: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const e = items[0];
  const { from, to } = who(e, personName);
  const head = e.kind === "email" ? e.body.split("\n\n")[0] : "";
  const subject = head.includes(" · ") ? head.slice(head.indexOf(" · ") + 3) : "";
  const body = e.kind === "email" ? e.body.slice(head.length).trim() : e.body;
  const label = KIND_LABEL[e.kind] ?? e.kind;
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      <span aria-hidden="true" className="absolute bottom-0 left-[17px] top-9 w-px bg-misty" />
      <KindDot kind={e.kind} count={items.length} />
      <div className="min-w-0 flex-1 border-b border-misty pb-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-sunken text-xs font-bold text-muted" aria-hidden="true">{initials(from)}</span>
            <div className="min-w-0">
              <div className="text-sm"><b>{from}</b>{to && <span className="muted"> › {to}</span>}<span className="sr-only"> · {label}</span></div>
              <div className="flex flex-wrap items-center gap-2 text-xs muted">
                <span>{when(e.at)}</span>
                {e.kind !== "email" && e.kind !== "text" && <span className="rounded bg-sunken px-1.5 font-semibold uppercase tracking-wide">{label}{e.outcome && e.kind === "call" ? ` · ${e.outcome}` : ""}</span>}
                {e.opened !== undefined && <span className={`rounded-full px-2 font-semibold ${e.opened ? "bg-accent-soft text-accent" : "bg-sunken"}`}>{e.opened ? `Opened ${when(e.opened)}` : "Not opened yet"}</span>}
              </div>
            </div>
          </div>
          {e.kind === "email" && subject && <button type="button" className="btn px-2.5 py-1 text-sm" onClick={() => onReply(subject)}>↩ Reply</button>}
        </div>
        {subject && <p className="mt-2 font-bold">{subject}</p>}
        <div className="mt-1.5 text-sm">
          {editing === e.id ? <EditEntry entry={e} onDone={() => { setEditing(null); onChanged(); }} />
            : e.kind === "email" ? <EmailText text={body} />
            : items.length > 1 && open ? <Bubbles items={[...items].reverse()} personName={personName} team={team} editing={editing} setEditing={setEditing} onChanged={onChanged} />
            : <div className="whitespace-pre-wrap break-words">{splitMentions(body, team).map((part, i) => part.mention ? <mark key={i} className="rounded bg-accent-soft px-0.5 font-semibold text-accent">{part.text}</mark> : part.text)}</div>}
          {e.audio && <audio controls preload="none" src={e.audio} className="mt-1 w-full max-w-sm" aria-label="Call recording" />}
        </div>
        {items.length > 1 && <button type="button" className="mt-2 text-sm font-semibold text-accent hover:underline" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Show only the latest" : `View ${items.length - 1} more text message${items.length === 2 ? "" : "s"}`}</button>}
        {e.editable && editing !== e.id && !(items.length > 1 && open) && (
          <div className="mt-1 flex gap-3 text-xs">
            <button type="button" className="font-semibold text-accent hover:underline" onClick={() => setEditing(e.id)}>Edit</button>
            <DeleteEntry id={e.id} onDone={onChanged} />
          </div>
        )}
      </div>
    </li>
  );
}

/** A text thread opened up: oldest first, ours on the right, theirs on the left. */
function Bubbles({ items, personName, team, editing, setEditing, onChanged }: { items: Entry[]; personName: string; team: Member[]; editing: string | null; setEditing: (id: string | null) => void; onChanged: () => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((m) => {
        const mine = m.outcome !== "Received";
        return (
          <div key={m.id} className={`flex max-w-[85%] flex-col ${mine ? "items-end self-end" : "items-start self-start"}`}>
            {editing === m.id ? <EditEntry entry={m} onDone={() => { setEditing(null); onChanged(); }} /> : (
              <p className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 ${mine ? "bg-accent text-white" : "bg-sunken"}`}>
                {splitMentions(m.body, team).map((part, i) => part.mention ? <b key={i}>{part.text}</b> : part.text)}
              </p>
            )}
            <span className="px-1 text-[11px] muted">{mine ? m.author ?? "You" : personName.split(" ")[0]} · {when(m.at)}
              {m.editable && editing !== m.id && <> · <button type="button" className="font-semibold text-accent hover:underline" onClick={() => setEditing(m.id)}>Edit</button> · <DeleteEntry id={m.id} onDone={onChanged} /></>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** An email's message, shortened until "Show full email". */
function EmailText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 400 || text.split("\n").length > 6;
  return (
    <div className="break-words">
      {text && <div className={`whitespace-pre-wrap ${open || !long ? "" : "line-clamp-6"}`}>{text}</div>}
      {long && <button type="button" className="mt-1 text-xs font-semibold text-accent hover:underline" onClick={() => setOpen(!open)}>{open ? "Show less" : "Show full email"}</button>}
    </div>
  );
}
