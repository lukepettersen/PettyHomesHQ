"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { labelsHtml } from "@/lib/labels";

/** "🖨 Labels" on Important dates (owner request 2026-11-24): the cards' names and addresses on a sheet of mailing
 *  labels (Avery 5160 size, 30 a sheet), to print and stick on instead of writing them. Names are the same as on each
 *  task (one person, or the household for a child's birthday). */
export function PrintLabels({ rows }: { rows: { name: string; address: string | null }[] }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(1);
  const ok = rows.filter((r) => r.address?.trim());
  const missing = rows.length - ok.length;
  if (!rows.length) return null;
  const print = () => {
    const w = window.open("", "_blank");
    if (!w) { alert("Your browser blocked the pop-up. Allow pop-ups for HQ and try again."); return; }
    w.document.open(); w.document.write(labelsHtml(ok, start)); w.document.close();
    setOpen(false);
  };
  return (
    <>
      <button type="button" className="font-medium normal-case tracking-normal text-accent hover:underline" title="Print mailing labels for these cards" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>🖨 Labels</button>
      {open && (
        <Modal title="Print mailing labels" onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-3 text-sm normal-case tracking-normal text-charcoal">
            <p><b>{ok.length}</b> label{ok.length === 1 ? "" : "s"} for Avery 5160 sheets (or any 1&quot; × 2⅝&quot; labels, 30 a sheet).{missing > 0 && <span className="text-[#9a6400]"> {missing} skipped: no mailing address yet.</span>}</p>
            <label className="label">Start at label # <span className="font-normal muted">(if the sheet is partly used; 1 = top left, counting across)</span>
              <input type="number" min={1} max={30} className="input w-24" value={start} onChange={(e) => setStart(Math.min(30, Math.max(1, Number(e.target.value) || 1)))} />
            </label>
            <p className="text-xs muted">In the print window: paper size Letter, scale <b>100%</b> (or &quot;Actual size&quot;), margins None or Default. Print one on plain paper first and hold it over a label sheet to check it lines up.</p>
            <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="btn btn-primary" disabled={!ok.length} onClick={print}>Print</button></div>
          </div>
        </Modal>
      )}
    </>
  );
}
