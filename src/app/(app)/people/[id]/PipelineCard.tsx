"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { fileLine, kMoney, type FileKind, type FileView } from "@/lib/files";
import type { StatusRow } from "@/server/files";
import { FileForm } from "../../pipeline/FileForm";
import { SideChip } from "./FileTabs";

/** Contact page → Pipeline: this person's buyer and listing files, + Add buyer / + Add seller. */
export function PipelineCard({ personId, personName, files, statuses, canSeeCommission }: { personId: string; personName: string; files: FileView[]; statuses: Record<"buyer" | "listing", StatusRow[]>; canSeeCommission: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState<FileKind | null>(null);
  const [msg, setMsg] = useState("");
  return (
    <section className="card p-4" aria-labelledby="pipe-h">
      <h3 id="pipe-h" className="font-bold">Pipeline <span className="text-sm font-normal muted">{files.length || ""}</span></h3>
      <ul className="mt-2 flex flex-col">
        {files.map((f) => (
          <li key={f.id} className="flex items-start justify-between gap-2 border-t border-misty/60 py-1.5 text-sm first:border-0">
            <span className="min-w-0"><SideChip kind={f.kind} /> <span className={f.closedAt ? "muted" : ""}>{f.kind === "buyer" ? fileLine(f) : (f.address ?? "Listing").split(",")[0]}</span>
              <span className="block text-xs muted">{f.status}</span></span>
            {f.price ? <span className="text-xs muted">{kMoney(f.price)}</span> : null}
          </li>
        ))}
      </ul>
      {files.length === 0 && <p className="mt-1 text-sm muted">Not buying or selling yet.</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={() => setAdding("buyer")}>+ Add buyer</button>
        <button type="button" className="btn" onClick={() => setAdding("listing")}>+ Add seller</button>
      </div>
      {msg && <p role="status" className="mt-2 text-sm text-accent">{msg}</p>}
      {adding && (
        <FileForm kind={adding} personId={personId} personName={personName} statuses={statuses[adding]} canSeeCommission={canSeeCommission}
          onClose={() => setAdding(null)} onSaved={(m) => { setAdding(null); setMsg(m); router.refresh(); }} />
      )}
    </section>
  );
}
