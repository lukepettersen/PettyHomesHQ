"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { fileLine, kMoney, type FileKind, type FileSection, type FileView } from "@/lib/files";
import type { StatusRow } from "@/server/files";
import { FileForm } from "../../pipeline/FileForm";
import { SideChip } from "./FileTabs";
import type { PaView } from "@/lib/pa";
import { OfferModal } from "./OfferModal";

/** Contact page → Pipeline: this person's buyer and listing files, + Add buyer / + Add seller. */
export function PipelineCard({ fileForms, personId, personName, files, contracts, statuses, canSeeCommission }: { fileForms: Record<"buyer" | "listing", FileSection[]>; personId: string; personName: string; files: FileView[]; contracts: PaView[]; statuses: Record<"buyer" | "listing", StatusRow[]>; canSeeCommission: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState<FileKind | null>(null);
  const [msg, setMsg] = useState("");
  const [offering, setOffering] = useState(false);
  return (
    <section className="card p-4" aria-labelledby="pipe-h">
      <h3 id="pipe-h" className="font-bold">Pipeline <span className="text-sm font-normal muted">{files.length || ""}</span></h3>
      <ul className="mt-2 flex flex-col">
        {files.map((f) => (
          <li key={f.id} className="flex items-start justify-between gap-2 border-t border-misty/60 py-1.5 text-sm first:border-0">
            <span className="min-w-0"><SideChip kind={f.kind} /> <span className={f.closedAt ? "muted" : ""}>{f.kind === "buyer" ? (contracts.find((c) => c.fileId === f.id && c.state === "active")?.address.split(",")[0] ?? fileLine(f)) : (f.address ?? "Listing").split(",")[0]}</span>
              <span className="block text-xs muted">{contracts.some((c) => c.fileId === f.id && c.state === "active") ? "Under contract" : f.status}</span></span>
            {f.price ? <span className="text-xs muted">{kMoney(f.price)}</span> : null}
          </li>
        ))}
      </ul>
      {contracts.length > 0 && (
        <ul className="flex flex-col">
          {contracts.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-2 border-t border-misty/60 py-1.5 text-sm">
              <span className="min-w-0"><SideChip kind="Contract" /> {c.address.split(",")[0]}
                <span className="block text-xs muted">{c.state === "active" ? "Under contract" : c.state === "closed" ? `Closed${c.endedOn ? ` ${c.endedOn.slice(5).replace("-", "/")}` : ""}` : "Fell through"}</span></span>
              <span className="text-xs muted">{kMoney(c.price)}</span>
            </li>
          ))}
        </ul>
      )}
      {files.length === 0 && <p className="mt-1 text-sm muted">Not buying or selling yet.</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={() => setAdding("buyer")}>+ Add buyer</button>
        <button type="button" className="btn" onClick={() => setAdding("listing")}>+ Add seller</button>
        <button type="button" className="btn btn-primary" onClick={() => setOffering(true)}>Submit offer</button>
      </div>
      {offering && <OfferModal personId={personId} personName={personName} fileId={null} onClose={() => setOffering(false)}
        buyerFiles={files.filter((f) => f.kind === "buyer" && !f.closedAt).map((f) => ({ id: f.id, label: `Buyer · ${contracts.find((c) => c.fileId === f.id && c.state === "active")?.address.split(",")[0] ?? fileLine(f)} (${f.status})` }))} />}
      {msg && <p role="status" className="mt-2 text-sm text-accent">{msg}</p>}
      {adding && (
        <FileForm form={fileForms[adding]} kind={adding} personId={personId} personName={personName} statuses={statuses[adding]} canSeeCommission={canSeeCommission}
          onClose={() => setAdding(null)} onSaved={(m) => { setAdding(null); setMsg(m); router.refresh(); }} />
      )}
    </section>
  );
}
