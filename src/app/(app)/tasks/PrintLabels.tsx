"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { ENVELOPES, envelopesHtml, labelsHtml, type EnvelopeSize } from "@/lib/labels";
import { saveReturnAddress } from "./actions";

/** "🖨 Labels" on Important dates (owner request 2026-11-24): the cards' names and addresses on a sheet of mailing
 *  labels (Avery 5160 size, 30 a sheet), to print and stick on instead of writing them. Names are the same as on each
 *  task (one person, or the household for a child's birthday). */
export function PrintLabels({ rows, returnAddress }: { rows: { name: string; address: string | null }[]; returnAddress: string }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(1);
  // Labels, or straight onto A7 envelopes with the return address (owner request 2026-11-24); remembered on this computer.
  const [on, setOn] = useState<"labels" | "envelopes">(() => { try { return localStorage.getItem("hq.cardPrint") === "envelopes" ? "envelopes" : "labels"; } catch { return "labels"; } });
  const [ret, setRet] = useState(returnAddress);
  const [size, setSize] = useState<EnvelopeSize>(() => { try { const v = localStorage.getItem("hq.envelopeSize"); return v && v in ENVELOPES ? (v as EnvelopeSize) : "small"; } catch { return "small"; } });
  const ok = rows.filter((r) => r.address?.trim());
  const missing = rows.length - ok.length;
  if (!rows.length) return null;
  const print = () => {
    const w = window.open("", "_blank");
    if (!w) { alert("Your browser blocked the pop-up. Allow pop-ups for HQ and try again."); return; }
    w.document.open(); w.document.write(on === "envelopes" ? envelopesHtml(ok, ret, size) : labelsHtml(ok, start)); w.document.close();
    try { localStorage.setItem("hq.cardPrint", on); localStorage.setItem("hq.envelopeSize", size); } catch { /* fine */ }
    if (on === "envelopes" && ret !== returnAddress) void saveReturnAddress(ret);
    setOpen(false);
  };
  return (
    <>
      <button type="button" className="font-medium normal-case tracking-normal text-accent hover:underline" title="Print labels or envelopes for these cards" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>🖨 Labels</button>
      {open && (
        <Modal title="Print card addresses" onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-3 text-sm normal-case tracking-normal text-charcoal">
            <fieldset className="flex flex-wrap gap-4"><legend className="sr-only">Print on</legend>
              <label className="flex items-center gap-2"><input type="radio" checked={on === "labels"} onChange={() => setOn("labels")} /> Labels (Avery 5160, 30 a sheet)</label>
              <label className="flex items-center gap-2"><input type="radio" checked={on === "envelopes"} onChange={() => setOn("envelopes")} /> Envelopes</label>
            </fieldset>
            <p><b>{ok.length}</b> {on === "labels" ? `label${ok.length === 1 ? "" : "s"}` : `envelope${ok.length === 1 ? "" : "s"}`}.{missing > 0 && <span className="text-[#9a6400]"> {missing} skipped: no mailing address yet.</span>}</p>
            {on === "labels" ? (
              <label className="label">Start at label # <span className="font-normal muted">(if the sheet is partly used; 1 = top left, counting across)</span>
                <input type="number" min={1} max={30} className="input w-24" value={start} onChange={(e) => setStart(Math.min(30, Math.max(1, Number(e.target.value) || 1)))} />
              </label>
            ) : (<>
              <label className="label">Envelope size
                <select className="input w-auto" value={size} onChange={(e) => setSize(e.target.value as EnvelopeSize)}>
                  {(Object.keys(ENVELOPES) as EnvelopeSize[]).map((k) => <option key={k} value={k}>{ENVELOPES[k].label}</option>)}
                </select>
              </label>
              <label className="label">Return address <span className="font-normal muted">(top left, small; remembered)</span>
                <textarea className="input min-h-20 font-normal" value={ret} onChange={(e) => setRet(e.target.value)} placeholder={"Petty Homes\nStreet\nCity, ST ZIP"} />
              </label>
            </>)}
            <p className="text-xs muted">{on === "labels"
              ? <>In the print window: paper size Letter, scale <b>100%</b> (or &quot;Actual size&quot;), margins None or Default. Print one on plain paper first and hold it over a label sheet to check it lines up.</>
              : <>In the print window: paper size <b>{size === "long" ? "#10 envelope" : size === "small" ? "A2 envelope" : "A7 envelope"}</b> (or a custom {ENVELOPES[size].w} × {ENVELOPES[size].h} in), landscape, scale <b>100%</b>, margins None. One envelope per page: load them in your printer&apos;s envelope tray the way its manual shows. Try one on a plain sheet cut to size first.</>}</p>
            <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="btn btn-primary" disabled={!ok.length} onClick={print}>Print</button></div>
          </div>
        </Modal>
      )}
    </>
  );
}
