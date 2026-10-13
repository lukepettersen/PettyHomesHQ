"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SaveBar } from "@/components/SaveBar";
import { AUTOMATION_KEYS, FIELD_TYPES, LOCKED_KEYS, showIfChoices, type FieldType, type PaField, type PaSection, type Side } from "@/lib/pa";
import { saveForm } from "../../pipeline/paActions";

const newKey = (label: string) => `q${label.replace(/[^A-Za-z0-9]/g, "").slice(0, 16)}${Math.random().toString(36).slice(2, 6)}`;

/** Edit sections and questions for each side: add, rename, reorder, remove, type, hint, required, choices, "Show only if" (SPEC.md §7.4). */
export function FormsClient({ forms }: { forms: Record<Side, PaSection[]> }) {
  const [side, setSide] = useState<Side>("buyer");
  return (
    <>
      <div role="tablist" aria-label="Form" className="mb-3 flex gap-1 border-b border-misty">
        {(["buyer", "seller"] as const).map((s) => (
          <button key={s} role="tab" type="button" aria-selected={side === s} onClick={() => setSide(s)}
            className={`-mb-px border-b-[3px] px-3 py-2 ${side === s ? "border-coral font-semibold" : "border-transparent muted"}`}>{s === "buyer" ? "Buyer side" : "Seller side"}</button>
        ))}
      </div>
      <FormEditor key={side} initial={forms[side]} locked={LOCKED_KEYS} automation={AUTOMATION_KEYS} stepLabels
        onSave={(sections) => saveForm({ side, sections })} />
    </>
  );
}

type Section = PaSection & { statuses?: string[] };

/** Shared by the purchase agreement and buyer/listing forms. With `statuses`, each section picks the statuses it shows at. */
export function FormEditor({ initial, onSave, locked, automation, statuses, stepLabels }: {
  initial: Section[]; onSave: (sections: Section[]) => Promise<{ ok: true } | { ok: false; error: string }>;
  locked: string[]; automation: string[]; statuses?: { id: string; name: string }[]; stepLabels?: boolean;
}) {
  const LOCKED_KEYS = locked, AUTOMATION_KEYS = automation;
  const router = useRouter();
  const [secs, setSecs] = useState<Section[]>(initial);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(secs) !== JSON.stringify(initial);
  const conds = showIfChoices(secs);
  const patchSec = (i: number, p: Partial<Section>) => setSecs(secs.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const patchField = (i: number, fi: number, p: Partial<PaField>) => patchSec(i, { fields: secs[i].fields.map((f, j) => (j === fi ? { ...f, ...p } : f)) });
  const moveSec = (i: number, d: number) => { const n = [...secs]; [n[i], n[i + d]] = [n[i + d], n[i]]; setSecs(n); };
  const moveField = (i: number, fi: number, d: number) => { const f = [...secs[i].fields]; [f[fi], f[fi + d]] = [f[fi + d], f[fi]]; patchSec(i, { fields: f }); };

  return (
    <div className="flex flex-col gap-4">
      {secs.map((s, i) => (
        <section key={s.id} className="card">
          <div className="flex flex-wrap items-center gap-2 border-b border-misty px-4 py-3">
            {stepLabels && <span className="text-xs font-semibold muted">{i === 0 ? "Step 2" : "Step 3"}</span>}
            <input aria-label="Section name" className="input min-w-[180px] flex-1 font-semibold" value={s.name} onChange={(e) => patchSec(i, { name: e.target.value })} />
            <select aria-label={`Show ${s.name} only if`} className="input w-auto" value={s.showIf ?? ""} onChange={(e) => patchSec(i, { showIf: e.target.value || undefined })}>
              <option value="">Always shown</option>
              {conds.map(([k, l]) => <option key={k} value={k}>Only if {l}</option>)}
            </select>
            {statuses && <ShownAt statuses={statuses} value={s.statuses ?? []} onChange={(v) => patchSec(i, { statuses: v.length ? v : undefined })} />}
            {!statuses && <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={!!s.people} onChange={(e) => patchSec(i, { people: e.target.checked || undefined })} /> People section</label>}
            <span className="flex gap-1">
              <button type="button" className="btn px-2" aria-label={`Move section ${s.name} up`} disabled={i === 0} onClick={() => moveSec(i, -1)}>↑</button>
              <button type="button" className="btn px-2" aria-label={`Move section ${s.name} down`} disabled={i === secs.length - 1} onClick={() => moveSec(i, 1)}>↓</button>
              <button type="button" className="btn px-2 text-bad" aria-label={`Remove section ${s.name}`} disabled={s.fields.some((f) => LOCKED_KEYS.includes(f.key))} onClick={() => setSecs(secs.filter((_, j) => j !== i))}>×</button>
            </span>
          </div>
          <ul>
            {s.fields.map((f, fi) => {
              const locked = LOCKED_KEYS.includes(f.key), auto = AUTOMATION_KEYS.includes(f.key);
              return (
                <li key={f.key} className="flex flex-wrap items-center gap-2 border-b border-misty/60 px-4 py-2 last:border-0">
                  <input aria-label="Question" className="input min-w-[160px] flex-1" value={f.label} onChange={(e) => patchField(i, fi, { label: e.target.value })} />
                  <select aria-label={`Type of ${f.label}`} className="input w-auto" value={f.type} disabled={locked} onChange={(e) => patchField(i, fi, { type: e.target.value as FieldType, options: e.target.value === "choice" ? f.options ?? ["Option 1", "Option 2"] : undefined })}>
                    {FIELD_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  {f.type === "choice" && (
                    <input aria-label={`Choices for ${f.label}`} className="input min-w-[160px] flex-1" defaultValue={(f.options ?? []).join(", ")} placeholder="Choices, separated by commas"
                      onBlur={(e) => patchField(i, fi, { options: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
                  )}
                  <input aria-label={`Hint for ${f.label}`} className="input w-36" placeholder="Hint" value={f.hint ?? ""} onChange={(e) => patchField(i, fi, { hint: e.target.value || undefined })} />
                  <select aria-label={`Show ${f.label} only if`} className="input w-auto" value={f.showIf ?? ""} onChange={(e) => patchField(i, fi, { showIf: e.target.value || undefined })}>
                    <option value="">Always</option>
                    {conds.filter(([k]) => !k.startsWith(`${f.key}=`)).map(([k, l]) => <option key={k} value={k}>Only if {l}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={!!f.required} disabled={locked} onChange={(e) => patchField(i, fi, { required: e.target.checked || undefined })} /> Required</label>
                  {auto && <span className="rounded-full bg-accent-soft px-2 text-[11px] font-semibold text-accent" title={locked ? "Can't be removed" : "Removing it makes dependent steps wait"}>Used by automations</span>}
                  <span className="ml-auto flex gap-1">
                    <button type="button" className="btn px-2" aria-label={`Move ${f.label} up`} disabled={fi === 0} onClick={() => moveField(i, fi, -1)}>↑</button>
                    <button type="button" className="btn px-2" aria-label={`Move ${f.label} down`} disabled={fi === s.fields.length - 1} onClick={() => moveField(i, fi, 1)}>↓</button>
                    <button type="button" className="btn px-2 text-bad" aria-label={`Remove ${f.label}`} disabled={locked} onClick={() => patchSec(i, { fields: s.fields.filter((_, j) => j !== fi) })}>×</button>
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-misty px-4 py-2">
            <button type="button" className="btn" onClick={() => patchSec(i, { fields: [...s.fields, { key: newKey("New question"), label: "New question", type: "text" }] })}>+ Add question</button>
          </div>
        </section>
      ))}
      <button type="button" className="btn self-start" onClick={() => setSecs([...secs, { id: newKey("section"), name: "New section", fields: [] }])}>+ Add section</button>
      <SaveBar dirty={dirty} pending={pending} error={error} onDiscard={() => { setSecs(initial); setError(""); }}
        onSave={() => start(async () => { setError(""); const r = await onSave(secs); if (!r.ok) setError(r.error); else router.refresh(); })} />
    </div>
  );
}

/** "Shown at": every status, or only the ticked ones. */
function ShownAt({ statuses, value, onChange }: { statuses: { id: string; name: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const label = !value.length ? "Shown at every status" : `Shown at ${value.length} status${value.length === 1 ? "" : "es"}`;
  return (
    <div className="relative">
      <button type="button" className="input w-auto text-left" aria-expanded={open} onClick={() => setOpen(!open)}>{label} ▾</button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 flex w-64 flex-col gap-1 rounded-lg border border-misty bg-white p-2 text-sm shadow-xl">
          <label className="flex items-center gap-2"><input type="checkbox" checked={!value.length} onChange={() => onChange([])} /> Every status</label>
          {statuses.map((st) => (
            <label key={st.id} className="flex items-center gap-2">
              <input type="checkbox" checked={value.includes(st.id)} onChange={(e) => onChange(e.target.checked ? [...value, st.id] : value.filter((x) => x !== st.id))} /> {st.name}
            </label>
          ))}
          <button type="button" className="btn mt-1 self-end px-2 py-0.5" onClick={() => setOpen(false)}>Done</button>
        </div>
      )}
    </div>
  );
}
