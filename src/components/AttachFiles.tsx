"use client";

import { useId, useRef, useState } from "react";
import { attachPersonFile, personFilesForEmail } from "@/app/(app)/people/emailActions";

export type Attached = { key: string; name: string; size: number; type: string };
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** "Attach file": uploads PDFs (or other documents) to attach to the email; shows each with a ×. */
export function AttachFiles({ files, onChange, personId }: { files: Attached[]; onChange: (f: Attached[]) => void; personId?: string | null }) {
  // "From their files" (owner request 2026-11-25): pick from the contact's Files card instead of uploading again.
  const [theirs, setTheirs] = useState<{ id: string; name: string; size: number }[] | null>(null);
  const openTheirs = async () => {
    if (theirs) { setTheirs(null); return; }
    setError("");
    const r = await personFilesForEmail(personId!);
    if (!r.ok) { setError(r.error); return; }
    setTheirs(r.data!);
  };
  const pickTheirs = async (docId: string) => {
    setBusy(true); setError("");
    const r = await attachPersonFile(docId);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    onChange([...files, r.data!]); setTheirs(null);
  };
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const add = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true); setError("");
    const next = [...files];
    for (const f of Array.from(list)) {
      const body = new FormData(); body.set("file", f);
      const r = await fetch("/api/email-attachments", { method: "POST", body }).catch(() => null);
      const d = r ? await r.json().catch(() => ({})) : {};
      if (!r?.ok) { setError(d.error ?? "The file didn't upload."); continue; }
      next.push(d as Attached);
    }
    onChange(next); setBusy(false);
    if (input.current) input.current.value = "";
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      {files.map((f) => (
        <span key={f.key} className="flex items-center gap-1 rounded-full bg-sunken px-2 py-0.5">
          📎 {f.name} <span className="text-xs muted">{kb(f.size)}</span>
          <button type="button" aria-label={`Remove ${f.name}`} className="px-0.5 hover:text-bad" onClick={() => onChange(files.filter((x) => x.key !== f.key))}>×</button>
        </span>
      ))}
      <input ref={input} type="file" multiple className="sr-only" id={inputId} onChange={(e) => add(e.target.files)} accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.heic,.txt,.csv" />
      <label htmlFor={inputId} className={`cursor-pointer font-semibold text-accent hover:underline ${busy ? "pointer-events-none opacity-60" : ""}`}>{busy ? "Uploading…" : "📎 Attach file"}</label>
      {personId && <button type="button" disabled={busy} className="font-semibold text-accent hover:underline" onClick={() => void openTheirs()} aria-expanded={!!theirs}>📁 From their files</button>}
      {error && <span role="alert" className="text-bad">{error}</span>}
      {theirs && (
        <div className="w-full rounded-md border border-misty bg-white p-2">
          {!theirs.length ? <p className="text-xs muted">No files on their Files card yet.</p> : (
            <ul className="flex flex-col">
              {theirs.map((d) => (
                <li key={d.id}><button type="button" disabled={busy} className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left hover:bg-sunken" onClick={() => void pickTheirs(d.id)}>
                  <span className="min-w-0 truncate">📄 {d.name}</span><span className="flex-none text-xs muted">{kb(d.size)}</span></button></li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
