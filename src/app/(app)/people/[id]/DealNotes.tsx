"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveFileNotes } from "../../pipeline/actions";
import { shortDay } from "@/lib/files";

/** Deal notes: what to remember about this buyer or seller deal, at the top of the deal (SPEC.md §7.1). */
export function DealNotes({ fileId, notes, notesAt, notesBy }: { fileId: string; notes: string; notesAt: string | null; notesBy: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(notes);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    const r = await saveFileNotes({ id: fileId, notes: text });
    if (!r.ok) { setError(r.error); return; }
    setError(""); setEditing(false); router.refresh();
  });
  const cancel = () => { setText(notes); setError(""); setEditing(false); };
  const when = notesAt ? `Updated ${shortDay(notesAt.slice(0, 10))}${notesBy ? ` by ${notesBy.split(" ")[0]}` : ""}` : "";

  if (editing) return (
    <div className="mt-3 rounded-lg border border-misty bg-paper p-3">
      <label className="label">Deal notes
        <textarea className="input min-h-24 font-normal" autoFocus value={text} placeholder="What to remember about this deal, e.g. looking casually; will sell her place once she finds one, could be up to 2 years."
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") cancel(); }} />
      </label>
      {error && <p role="alert" className="mt-1 text-sm text-bad">{error}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" className="btn" onClick={cancel} disabled={pending}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={pending || text.trim() === notes}>{pending ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
  return notes ? (
    <button type="button" onClick={() => setEditing(true)} title="Edit deal notes"
      className="mt-3 block w-full rounded-lg border border-[#ecdcae] bg-[#fdf8e8] px-3 py-2 text-left hover:border-accent">
      <span className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-[#8a6d1d]">Deal notes<span className="font-normal normal-case tracking-normal muted">{when} · Edit</span></span>
      <span className="mt-1 block whitespace-pre-wrap text-sm">{notes}</span>
    </button>
  ) : (
    <button type="button" className="mt-3 text-sm font-semibold text-accent hover:underline" onClick={() => setEditing(true)}>+ Add deal notes</button>
  );
}
