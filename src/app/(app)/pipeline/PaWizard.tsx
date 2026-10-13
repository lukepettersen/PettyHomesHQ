"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/Modal";
import { COMMISSION_KEYS, visibleSections, type Answers, type PaField, type PaSection, type PaView, type Side } from "@/lib/pa";
import { addPurchaseAgreement, updatePurchaseAgreement } from "./paActions";

type Props = {
  fileId: string; fileKind: "buyer" | "listing"; personName: string; fileLine: string; prefill?: Answers; pa?: PaView;
  forms: Record<Side, PaSection[]>; canSeeCommission: boolean; onClose: () => void; onSaved: (m: string) => void;
};

/** Step 1: who you represent. Step 2: the first section. Step 3: everything else. Editing shows it all (SPEC.md §7.4). */
export function PaWizard({ fileId, fileKind, personName, fileLine, prefill, pa, forms, canSeeCommission, onClose, onSaved }: Props) {
  const editing = !!pa;
  const [side, setSide] = useState<Side>(pa?.side ?? (fileKind === "buyer" ? "buyer" : "seller"));
  const [step, setStep] = useState(editing ? 0 : 1);
  const [v, setV] = useState<Answers>(() => pa ? fromPa(pa) : { hoa: "No", newc: "No", ptype: "Single family", fin: "Conventional", ...prefill });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const form = forms[side].map((s) => ({ ...s, fields: s.fields.filter((f) => canSeeCommission || !COMMISSION_KEYS.includes(f.key)) }));
  const sections = visibleSections(form, v);
  const onPage = step === 2 ? sections.slice(0, 1) : step === 3 ? sections.slice(1) : step === 0 ? sections : [];

  const missing = (secs: PaSection[]) => secs.flatMap((s) => s.fields).filter((f) => f.required && !(v[f.key] ?? "").trim());
  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    if (step === 1) { setStep(2); return; }
    const miss = missing(onPage);
    if (miss.length) { setError(`Add the ${miss.map((f) => f.label.toLowerCase()).join(" and ")} first.`); return; }
    if (step === 2) { setStep(3); return; }
    start(async () => {
      const r = editing ? await updatePurchaseAgreement({ id: pa!.id, answers: v }) : await addPurchaseAgreement({ fileId, side, answers: v });
      if (!r.ok) { setError(r.error); return; }
      onSaved(editing ? "Saved." : "Purchase agreement added. They're now under contract.");
    });
  };

  const title = editing ? "Edit purchase agreement" : `Purchase agreement${step === 1 ? "" : side === "buyer" ? " · buyer side" : " · seller side"}`;
  return (
    <Modal title={title} onClose={onClose} wide>
      <form onSubmit={submit} autoComplete="off" className="flex flex-col gap-4">
        <p className="-mt-2 text-sm muted">{personName} · {fileLine}{step ? <> · <b>Step {step} of 3</b></> : null}</p>
        {step === 1 && (
          <fieldset>
            <legend className="mb-2 font-semibold">Who do you represent?</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {([["buyer", "The buyer", "Buyer-side form and checklist"], ["seller", "The seller", "Seller-side form and checklist"]] as const).map(([k, l, d]) => (
                <button key={k} type="button" aria-pressed={side === k} onClick={() => setSide(k)}
                  className={`flex flex-col rounded-lg border p-3 text-left ${side === k ? "border-accent bg-accent-soft" : "border-misty hover:bg-sunken"}`}>
                  <b>{l}</b><span className="text-xs muted">{d}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}
        {onPage.map((s) => (
          <fieldset key={s.id} className="rounded-lg border border-misty px-3 pt-1 pb-3">
            <legend className="px-1 text-sm font-bold">{s.name}</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {s.fields.map((f) => <PaInput key={f.key} f={f} v={v} set={(k, x) => setV((o) => ({ ...o, [k]: x }))} />)}
            </div>
          </fieldset>
        ))}
        {step === 3 && <p className="rounded-md bg-sunken px-3 py-2 text-sm muted">Saving puts {personName} under contract. They move to the Under Contract/Pending tab on the Pipeline.</p>}
        {editing && <p className="text-xs muted">Moving a key date that was still pending marks it Extended.</p>}
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        <div className="flex justify-end gap-2">
          {step > 1 && <button type="button" className="btn mr-auto" onClick={() => { setError(""); setStep(step - 1); }}>← Back</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={pending}>{editing ? "Save changes" : step < 3 ? "Next →" : "Add purchase agreement"}</button>
        </div>
      </form>
    </Modal>
  );
}

function fromPa(pa: PaView): Answers {
  const a: Answers = { ...pa.answers, address: pa.address, price: String(pa.price) };
  for (const [k, d] of Object.entries(pa.dates)) if (d) a[k] = d;
  if (pa.writtenStatementNA) a.writtenStatement_na = "yes";
  if (pa.commission !== null) a.commission = pa.commission;
  if (pa.bac !== null) a.bac = pa.bac;
  return a;
}

function PaInput({ f, v, set }: { f: PaField; v: Answers; set: (k: string, x: string) => void }) {
  const label = `${f.label}${f.required ? " *" : ""}`;
  const value = v[f.key] ?? "";
  if (f.type === "yesno" || f.type === "choice") {
    const opts = f.type === "yesno" ? ["No", "Yes"] : f.options ?? [];
    return (
      <label className="label">{label}
        <select className="input" value={value} onChange={(e) => set(f.key, e.target.value)}>
          {!opts.includes(value) && <option value="">—</option>}
          {opts.map((o) => <option key={o}>{o}</option>)}
        </select>
      </label>
    );
  }
  if (f.type === "date-na") {
    const na = v[`${f.key}_na`] === "yes";
    return (
      <div className="label">{label}
        <span className="flex items-center gap-2">
          <input aria-label={f.label} type="date" className="input" value={na ? "" : value} disabled={na} onChange={(e) => set(f.key, e.target.value)} />
          <label className="flex items-center gap-1 text-sm font-normal text-charcoal"><input type="checkbox" checked={na} onChange={(e) => set(`${f.key}_na`, e.target.checked ? "yes" : "")} /> N/A</label>
        </span>
      </div>
    );
  }
  const type = f.type === "date" ? "date" : f.type === "datetime" ? "datetime-local" : "text";
  const ph = f.hint ?? (f.type === "money" ? "$" : f.type === "pct" ? "e.g. 2.7" : "");
  return (
    <label className="label">{label}
      <input className="input" type={type} value={value} placeholder={ph} inputMode={["money", "number", "pct"].includes(f.type) ? "decimal" : undefined} onChange={(e) => set(f.key, e.target.value)} />
    </label>
  );
}
