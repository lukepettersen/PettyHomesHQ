"use client";

import { AddressInput } from "@/components/AddressInput";
import { useState, useTransition } from "react";
import { Modal } from "@/components/Modal";
import { clientFirstNames, COMMISSION_KEYS, visibleSections, type Answers, type PaField, type PaSection, type PaView, type Side } from "@/lib/pa";
import { addPurchaseAgreement, updatePurchaseAgreement } from "./paActions";
import { DateTimeInput } from "@/components/TimeSelect";
import { fillFromPartner, sectionPartnerType } from "@/lib/partners";
import { PartnerPicker } from "./PartnerPicker";

type Props = {
  fileId: string; fileKind: "buyer" | "listing"; personName: string; fileLine: string; prefill?: Answers; pa?: PaView;
  forms: Record<Side, PaSection[]>; canSeeCommission: boolean; onClose: () => void; onSaved: (m: string) => void;
};

/** Step 1: who you represent. Step 2: the first section. Step 3: everything else. Editing shows it all (SPEC.md §7.4). */
export function PaWizard({ fileId, fileKind, personName, fileLine, prefill, pa, forms, canSeeCommission, onClose, onSaved }: Props) {
  const editing = !!pa;
  const [side, setSide] = useState<Side>(pa?.side ?? (fileKind === "buyer" ? "buyer" : "seller"));
  const [step, setStep] = useState(editing ? 0 : 1);
  const [v, setV] = useState<Answers>(() => pa ? fromPa(pa) : { hoa: "No", newc: "No", ptype: "Single family", fin: "Conventional", referral: "No", defect: "No", ...prefill });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  // People sections: the partner contact picked for each, and typed-in ones to save as new contacts.
  const [picked, setPicked] = useState<Record<string, { id: string; name: string }>>(pa?.partners ?? {});
  const [saveAs, setSaveAs] = useState<string[]>([]);
  const form = forms[side].map((s) => ({ ...s, fields: s.fields.filter((f) => canSeeCommission || !COMMISSION_KEYS.includes(f.key)) }));
  const sections = visibleSections(form, v);
  const names = clientFirstNames(personName);
  const onPage = step === 2 ? sections.slice(0, 1) : step === 3 ? sections.slice(1) : step === 0 ? sections : [];

  const missing = (secs: PaSection[]) => secs.flatMap((s) => s.fields).filter((f) => f.required && !(v[f.key] ?? "").trim());
  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    if (step === 1) { setStep(2); return; }
    const miss = missing(onPage);
    if (miss.length) { setError(`Add the ${miss.map((f) => f.label.toLowerCase()).join(" and ")} first.`); return; }
    if (step === 2) { setStep(3); return; }
    start(async () => {
      const links = { partners: Object.fromEntries(Object.entries(picked).map(([k, x]) => [k, x.id])), saveAsContact: saveAs.filter((k) => !picked[k]) };
      const r = editing ? await updatePurchaseAgreement({ id: pa!.id, answers: v, ...links }) : await addPurchaseAgreement({ fileId, side, answers: v, ...links });
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
              {s.people && (
                <PartnerPicker type={sectionPartnerType(s)} picked={picked[s.id] ?? null}
                  onPick={(p) => { setV((o) => ({ ...o, ...fillFromPartner(s, p) })); setPicked((x) => ({ ...x, [s.id]: { id: p.id, name: p.name } })); }}
                  onClear={() => setPicked((x) => { const n = { ...x }; delete n[s.id]; return n; })} />
              )}
              {s.fields.map((f) => <PaInput key={f.key} f={f} v={v} names={names} set={(k, x) => setV((o) => ({ ...o, [k]: x }))} />)}
              {s.people && !picked[s.id] && s.fields.some((f) => (v[f.key] ?? "").trim()) && (
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={saveAs.includes(s.id)} onChange={(e) => setSaveAs((x) => (e.target.checked ? [...x, s.id] : x.filter((y) => y !== s.id)))} />
                  Save as contact, so they&apos;re in the list next time
                </label>
              )}
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

function PaInput({ f, v, names, set }: { f: PaField; v: Answers; names: string[]; set: (k: string, x: string) => void }) {
  const label = `${f.label}${f.required ? " *" : ""}`;
  const value = v[f.key] ?? "";
  if (f.type === "yesno" || f.type === "choice" || f.type === "client") {
    // Client name: the client's first names; an answer typed before it was a dropdown stays a choice.
    const opts = f.type === "yesno" ? ["No", "Yes"] : f.type === "client" ? (value && !names.includes(value) ? [...names, value] : names) : f.options ?? [];
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
  if (f.type === "datetime") return <div className="label">{label}<DateTimeInput label={f.label} value={value} onChange={(x) => set(f.key, x)} /></div>;
  if (f.key === "address") return <div className="label">{label}<AddressInput label={f.label} value={value} onChange={(x) => set(f.key, x)} placeholder={f.hint ?? "Street, city"} /></div>;
  const type = f.type === "date" ? "date" : "text";
  const ph = f.hint ?? (f.type === "money" ? "$" : f.type === "pct" ? "e.g. 2.7" : "");
  return (
    <label className="label">{label}
      <input className="input" type={type} value={value} placeholder={ph} inputMode={["money", "number", "pct"].includes(f.type) ? "decimal" : undefined} onChange={(e) => set(f.key, e.target.value)} />
    </label>
  );
}
