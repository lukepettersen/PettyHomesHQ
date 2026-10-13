"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { extLabel, sizeLabel, uploadProblem } from "@/lib/documents";
import { shortDay } from "@/lib/files";
import { deleteDocument } from "../docActions";

type Doc = { id: string; name: string; size: number; date: string };

/** Contact page → Files: upload, download, delete (two-step). Off until file storage is connected. */
export function FilesCard({ personId, docs, connected, isAdmin }: { personId: string; docs: Doc[]; connected: boolean; isAdmin: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    for (const f of Array.from(files)) {
      const problem = uploadProblem(f.name, f.size);
      if (problem) { setError(problem); continue; }
      setBusy(`Uploading ${f.name}…`);
      const body = new FormData(); body.append("personId", personId); body.append("file", f);
      const r = await fetch("/api/documents", { method: "POST", body }).catch(() => null);
      if (!r || !r.ok) setError(r ? ((await r.json().catch(() => ({}))) as { error?: string }).error ?? "The upload didn't go through." : "The upload didn't go through.");
    }
    setBusy(""); if (input.current) input.current.value = ""; router.refresh();
  }

  return (
    <section className="card p-4" aria-labelledby="files-h"
      onDragOver={(e) => { if (connected) e.preventDefault(); }} onDrop={(e) => { if (!connected) return; e.preventDefault(); upload(e.dataTransfer.files); }}>
      <div className="flex items-center justify-between">
        <h3 id="files-h" className="font-bold">Files <span className="text-sm font-normal muted">{docs.length || ""}</span></h3>
        {connected && <button type="button" className="link text-sm" disabled={!!busy} onClick={() => input.current?.click()}>+ Add file</button>}
        <input ref={input} type="file" multiple hidden onChange={(e) => upload(e.target.files)} aria-label="Choose files to upload" />
      </div>
      {!connected ? (
        <p className="mt-1 text-sm muted">File storage isn&apos;t connected yet.{isAdmin ? " Set it up in Admin → Integrations." : " Ask Luke to set it up."}</p>
      ) : (
        <>
          <ul className="mt-2 flex flex-col">
            {docs.map((d) => (
              <li key={d.id} className="flex items-start gap-2.5 border-t border-misty/60 py-2 text-sm first:border-0">
                <span className="mt-0.5 rounded bg-sunken px-1.5 py-0.5 text-[10px] font-bold text-muted">{extLabel(d.name)}</span>
                <span className="min-w-0 flex-1">
                  <a className="link block break-words" href={`/api/documents/${d.id}`}>{d.name}</a>
                  <span className="text-xs muted">{shortDay(d.date)} · {sizeLabel(d.size)}</span>
                  <span className="mt-0.5 flex gap-3 text-xs">
                    <a className="font-semibold text-accent hover:underline" href={`/api/documents/${d.id}`}>Download</a>
                    <button type="button" className="font-semibold text-bad hover:underline" onBlur={() => setConfirm(null)}
                      onClick={async () => { if (confirm !== d.id) { setConfirm(d.id); return; } const r = await deleteDocument(d.id); if (!r.ok) setError(r.error); else router.refresh(); }}>
                      {confirm === d.id ? "Click again to delete" : "Delete"}
                    </button>
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {docs.length === 0 && <p className="mt-1 text-sm muted">No files yet. Add the PA, counters, pre-approval and disclosures here, or drop files on this card.</p>}
        </>
      )}
      {busy && <p role="status" className="mt-2 text-sm muted">{busy}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
    </section>
  );
}
