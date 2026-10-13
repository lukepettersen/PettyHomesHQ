"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { addTimelineEntry } from "../actions";
import { mentionLabel, mentionQuery, splitMentions, type Member } from "@/lib/mentions";
import { EmailComposer } from "./EmailComposer";

type Entry = { id: string; kind: string; body: string; outcome: string | null; author: string | null; at: string };
const TABS: [Kind, string, string, string][] = [
  ["note", "Note", "Add a note.", "Save note"],
  ["text", "Log text", "What did you text them? For texts sent from your own phone.", "Log text"],
  ["call", "Log call", "What did you talk about?", "Log call"],
  ["email", "Email", "", ""],
];
type Kind = "note" | "text" | "call" | "email";
const KIND_LABEL: Record<string, string> = { note: "Note", text: "Text", call: "Call", email: "Email", system: "Update", task: "Task done" };
const FILTERS: [string, string][] = [["all", "All"], ["note", "Notes"], ["email", "Emails"], ["text", "Texts"], ["call", "Calls"], ["task", "Tasks"]];
type EmailProps = { emails: string[]; templates: { id: string; name: string }[]; sendsFrom: string | null };

export function Timeline({ personId, entries, team, email }: { personId: string; entries: Entry[]; team: Member[]; email: EmailProps }) {
  const [kind, setKind] = useState<Kind>("note");
  const [body, setBody] = useState("");
  const [outcome, setOutcome] = useState("Talked");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pick, setPick] = useState<{ q: string; i: number } | null>(null);
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
      if (kind === "email") return;
      const r = await addTimelineEntry({ personId, kind, body, outcome: kind === "call" ? outcome : undefined });
      if (!r.ok) { setError(r.error); return; }
      const names = r.data?.mentioned ?? [];
      setNotice(names.length ? `Saved. ${names.join(" and ")} will see it in their notifications.` : "");
      setBody(""); setPick(null); router.refresh();
    });
  }

  return (
    <div className="card mt-3 p-4">
      <div className="flex gap-1">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${kind === k ? "border border-misty bg-white" : "muted hover:text-charcoal"}`}>{label}</button>
        ))}
      </div>
      {kind === "email" && <EmailComposer personId={personId} {...email} />}
      {kind === "call" && (
        <select className="input mt-2 w-auto" value={outcome} onChange={(e) => setOutcome(e.target.value)} aria-label="Call outcome">
          <option>Talked</option><option>Left voicemail</option><option>No answer</option>
        </select>
      )}
      {kind !== "email" && <><div className="relative">
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

      <div className="mt-4 flex flex-wrap gap-1.5">
        {FILTERS.map(([k, l]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${filter === k ? "border-charcoal bg-charcoal text-white" : "border-misty bg-white"}`}>
            {l} <span className="opacity-70">{k === "all" ? entries.length : entries.filter((e) => e.kind === k).length}</span>
          </button>
        ))}
      </div>
      {shown.length ? (
        <ol className="mt-3">
          {shown.map((e) => (
            <li key={e.id} className="grid grid-cols-[70px_minmax(0,1fr)] gap-3 border-t border-misty py-2.5 text-sm first:border-0">
              <span className="text-xs font-bold uppercase tracking-wide muted">{KIND_LABEL[e.kind] ?? e.kind}</span>
              <div>
                {e.kind === "email" ? <EmailBody body={e.body} /> : <div className="whitespace-pre-wrap break-words">{e.outcome ? <b>{e.outcome}: </b> : null}{splitMentions(e.body, team).map((part, i) => part.mention ? <mark key={i} className="rounded bg-accent-soft px-0.5 font-semibold text-accent">{part.text}</mark> : part.text)}</div>}
                <div className="text-xs muted">{new Date(e.at).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}{e.author ? ` · ${e.author}` : ""}</div>
              </div>
            </li>
          ))}
        </ol>
      ) : <p className="mt-3 text-sm muted">Nothing here yet.</p>}
    </div>
  );
}

/** An email on the timeline: "From/To … · Subject" in bold, the message shortened until opened. */
function EmailBody({ body }: { body: string }) {
  const [open, setOpen] = useState(false);
  const i = body.indexOf("\n\n");
  const head = i < 0 ? body : body.slice(0, i), text = i < 0 ? "" : body.slice(i + 2);
  const long = text.length > 280 || text.split("\n").length > 4;
  return (
    <div className="break-words">
      <b className="font-semibold">{head}</b>
      {text && <div className={`whitespace-pre-wrap ${open || !long ? "" : "line-clamp-4"}`}>{text}</div>}
      {long && <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={() => setOpen(!open)}>{open ? "Show less" : "Show full email"}</button>}
    </div>
  );
}
