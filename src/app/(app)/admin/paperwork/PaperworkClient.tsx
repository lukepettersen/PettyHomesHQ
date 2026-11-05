"use client";

import { useState, useTransition } from "react";
import { allTypes, customType, DEFAULT_STEPS, type PaperConfig, type PaperStep, type PaperType } from "@/lib/paperwork";
import { savePaperwork } from "./actions";

// Admin → Paperwork steps (SPEC.md §7.5b): pick a form, edit its steps, add your own forms. Explicit Save/Cancel.
const newKey = () => `c_${Math.random().toString(36).slice(2, 10)}`;

export function PaperworkClient({ initial }: { initial: PaperConfig }) {
  const [cfg, setCfg] = useState<PaperConfig>(initial);
  const [saved, setSaved] = useState<PaperConfig>(initial);
  const [sel, setSel] = useState(allTypes(initial.custom)[0].key);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [pending, start] = useTransition();
  const types = allTypes(cfg.custom);
  const t = types.find((x) => x.key === sel) ?? types[0];
  const steps = cfg.steps[t.key] ?? [];
  const isCustom = t.key.startsWith("c_");
  const dirty = JSON.stringify(cfg) !== JSON.stringify(saved);

  const setSteps = (rows: PaperStep[]) => { setMsg(""); setCfg({ ...cfg, steps: { ...cfg.steps, [t.key]: rows } }); };
  const edit = (i: number, p: Partial<PaperStep>) => setSteps(steps.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const move = (i: number, d: -1 | 1) => { const r = [...steps]; const j = i + d; if (j < 0 || j >= r.length) return; [r[i], r[j]] = [r[j], r[i]]; setSteps(r); };
  const addForm = () => { const key = newKey(); setCfg({ custom: [...cfg.custom, customType(key, "New form")], steps: { ...cfg.steps, [key]: [{ text: "In ClickContracts, open the form for {address}.", when: "" }, { text: "Send it for signatures.", when: "" }] } }); setSel(key); setMsg(""); };
  const rename = (label: string) => setCfg({ ...cfg, custom: cfg.custom.map((c) => (c.key === t.key ? { ...c, label } : c)) });
  const removeForm = () => { const rest = { ...cfg.steps }; delete rest[t.key]; setCfg({ custom: cfg.custom.filter((c) => c.key !== t.key), steps: rest }); setSel(types[0].key); setConfirmDel(false); };

  const save = () => start(async () => {
    setError("");
    const r = await savePaperwork({ steps: cfg.steps, custom: cfg.custom.map((c) => ({ key: c.key, label: c.label })) });
    if (!r.ok) { setError(r.error); return; }
    setCfg(r.data!); setSaved(r.data!); setMsg("Saved. New requests use these steps.");
  });

  return (
    <div className="card p-5">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Form">
        {types.map((p) => (
          <button key={p.key} type="button" role="tab" aria-selected={t.key === p.key} onClick={() => { setSel(p.key); setConfirmDel(false); }}
            className={`rounded-full border px-3 py-1 text-sm font-semibold ${t.key === p.key ? "border-accent bg-accent text-white" : "border-misty bg-white hover:bg-sunken"}`}>{p.label}</button>
        ))}
        <button type="button" className="rounded-full border border-dashed border-misty px-3 py-1 text-sm font-semibold text-accent hover:bg-sunken" onClick={addForm}>+ Add a form</button>
      </div>

      {isCustom && (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="label min-w-[16rem] flex-1">Form name<input className="input mt-1" value={t.label} onChange={(e) => rename(e.target.value)} placeholder="e.g. Buyer rep agreement" /></label>
          <button type="button" className="btn text-bad" onBlur={() => setConfirmDel(false)} onClick={() => (confirmDel ? removeForm() : setConfirmDel(true))}>{confirmDel ? "Click again to remove" : "Remove form"}</button>
        </div>
      )}

      <h2 className="mt-4 font-bold">Steps for {t.label.toLowerCase()}</h2>
      <Fill t={t} />
      <ol className="mt-3 space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="flex flex-wrap items-start gap-2">
            <span className="mt-2 w-5 text-right text-sm font-semibold muted">{i + 1}.</span>
            <textarea aria-label={`Step ${i + 1}`} className="input min-w-[14rem] flex-1 text-sm" rows={2} value={s.text} onChange={(e) => edit(i, { text: e.target.value })} />
            {t.options && (
              <select aria-label={`Step ${i + 1}: only when`} className="input w-auto text-sm" value={s.when} onChange={(e) => edit(i, { when: e.target.value })}>
                <option value="">Always</option>
                {t.options.map((o) => <option key={o.key} value={o.key}>Only for {o.label.toLowerCase()}</option>)}
              </select>
            )}
            <span className="flex gap-1">
              <button type="button" className="btn px-2 py-1 text-xs" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button type="button" className="btn px-2 py-1 text-xs" aria-label={`Move step ${i + 1} down`} disabled={i === steps.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button type="button" className="btn px-2 py-1 text-xs text-bad" aria-label={`Remove step ${i + 1}`} onClick={() => setSteps(steps.filter((_, j) => j !== i))}>✕</button>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="btn text-sm" onClick={() => setSteps([...steps, { text: "", when: "" }])}>+ Add step</button>
        {!isCustom && DEFAULT_STEPS[t.key] && <button type="button" className="btn text-sm muted" onClick={() => setSteps(DEFAULT_STEPS[t.key])}>Use the starting steps</button>}
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}
      {msg && <p role="status" className="mt-3 text-sm text-accent">{msg}</p>}
      <div className="mt-4 flex justify-end gap-2 border-t border-misty pt-3">
        <button type="button" className="btn" disabled={!dirty || pending} onClick={() => { setCfg(saved); setError(""); setMsg(""); if (!allTypes(saved.custom).some((x) => x.key === sel)) setSel(allTypes(saved.custom)[0].key); }}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={!dirty || pending} onClick={save}>{pending ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}

/** What can be filled in: {address} and friends, with the field each one comes from. */
function Fill({ t }: { t: PaperType }) {
  const items: [string, string][] = [["client", "Client name"], ...t.fields.map((f) => [f.key, f.label] as [string, string]), ["notes", "Notes"]];
  return (
    <p className="mt-1 text-xs muted">
      Fill-ins: {items.map(([k, l], i) => <span key={k}>{i > 0 && " · "}<code className="rounded bg-sunken px-1">{`{${k}}`}</code> {l.toLowerCase()}</span>)}. A blank one shows as ____.
    </p>
  );
}
