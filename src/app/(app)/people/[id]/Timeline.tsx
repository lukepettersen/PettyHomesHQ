"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addTimelineEntry } from "../actions";

type Entry = { id: string; kind: string; body: string; outcome: string | null; author: string | null; at: string };
const TABS: [Kind, string, string, string][] = [
  ["note", "Note", "Add a note.", "Save note"],
  ["text", "Log text", "What did you text them? For texts sent from your own phone.", "Log text"],
  ["call", "Log call", "What did you talk about?", "Log call"],
];
type Kind = "note" | "text" | "call";
const KIND_LABEL: Record<string, string> = { note: "Note", text: "Text", call: "Call", email: "Email", system: "Update" };
const FILTERS: [string, string][] = [["all", "All"], ["note", "Notes"], ["text", "Texts"], ["call", "Calls"]];

export function Timeline({ personId, entries }: { personId: string; entries: Entry[] }) {
  const [kind, setKind] = useState<Kind>("note");
  const [body, setBody] = useState("");
  const [outcome, setOutcome] = useState("Talked");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const tab = TABS.find((t) => t[0] === kind)!;
  const shown = entries.filter((e) => filter === "all" || e.kind === filter);

  function save() {
    setError("");
    start(async () => {
      const r = await addTimelineEntry({ personId, kind, body, outcome: kind === "call" ? outcome : undefined });
      if (!r.ok) { setError(r.error); return; }
      setBody(""); router.refresh();
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
      {kind === "call" && (
        <select className="input mt-2 w-auto" value={outcome} onChange={(e) => setOutcome(e.target.value)} aria-label="Call outcome">
          <option>Talked</option><option>Left voicemail</option><option>No answer</option>
        </select>
      )}
      <textarea className="input mt-2 min-h-24" value={body} onChange={(e) => setBody(e.target.value)} placeholder={tab[2]} aria-label={tab[1]} />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs muted">Email stays in Gmail. Sent and received emails will show here once Gmail is connected.</span>
        <button type="button" className="btn btn-primary" disabled={pending || !body.trim()} onClick={save}>{pending ? "Saving…" : tab[3]}</button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}

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
                <div className="whitespace-pre-wrap break-words">{e.outcome ? <b>{e.outcome}: </b> : null}{e.body}</div>
                <div className="text-xs muted">{new Date(e.at).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}{e.author ? ` · ${e.author}` : ""}</div>
              </div>
            </li>
          ))}
        </ol>
      ) : <p className="mt-3 text-sm muted">Nothing here yet.</p>}
    </div>
  );
}
