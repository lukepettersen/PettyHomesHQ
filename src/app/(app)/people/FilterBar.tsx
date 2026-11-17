"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { DAY_FIELDS, describeFilter, FIELD_LABELS, FIELD_OPS, MULTI_OPS, pipelineLabel, type Filter, type FilterField } from "@/lib/filters";
import { Modal } from "@/components/Modal";
import { PARTNER_TYPES } from "@/lib/partners";
import { createSmartList, saveSmartListFilters } from "./listActions";

export type FilterOptions = { stages: string[]; tags: string[]; sources: string[]; followUp: number[]; team: string[]; pipeline: string[] };

function valuesFor(field: FilterField, o: FilterOptions): [string, string][] | null {
  switch (field) {
    case "stage": return o.stages.map((s) => [s, s]);
    case "pipeline": return o.pipeline.map((v) => [v, pipelineLabel(v)]);
    case "type": return PARTNER_TYPES.map(([, l]) => [l, l]);
    case "tag": return o.tags.map((s) => [s, s]);
    case "source": return o.sources.map((s) => [s, s]);
    case "assigned": return [["Nobody", "Nobody"], ...o.team.map((s) => [s, s] as [string, string])];
    case "followUp": return [["none", "Not set"], ...o.followUp.map((d) => [String(d), `Every ${d} days`] as [string, string])];
    case "dueForTouch": case "upcomingTask": case "hasEmail": case "hasPhone": return [["yes", "Yes"], ["no", "No"]];
    default: return null; // day fields: a number of days
  }
}

export function FilterBar({ list, working, options, collections, q, startBuilding, newCollectionId }: {
  list?: { id: string; name: string; filters: Filter[] }; working: Filter[]; options: FilterOptions;
  collections: { id: string; name: string }[]; q: string; startBuilding?: boolean; newCollectionId?: string;
}) {
  const router = useRouter();
  const [building, setBuilding] = useState(!!startBuilding);
  const [field, setField] = useState<FilterField>("stage");
  const [op, setOp] = useState("is");
  const [value, setValue] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [find, setFind] = useState("");
  // The picker is a small pop-up (owner-approved mockup 2026-10-30): Escape or a click outside closes it.
  const pop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!building) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setBuilding(false); };
    const click = (e: MouseEvent) => { if (pop.current && !pop.current.contains(e.target as Node)) setBuilding(false); };
    window.addEventListener("keydown", key); window.addEventListener("mousedown", click);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("mousedown", click); };
  }, [building]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const saved = list?.filters ?? [];
  const changed = JSON.stringify(working) !== JSON.stringify(saved);

  const go = (filters: Filter[]) => {
    const p = new URLSearchParams();
    if (list) p.set("list", list.id);
    if (JSON.stringify(filters) !== JSON.stringify(saved)) p.set("f", JSON.stringify(filters));
    if (q) p.set("q", q);
    if (newCollectionId) p.set("new", newCollectionId);
    router.push(`/people${p.size ? `?${p}` : ""}`);
  };
  const vals = valuesFor(field, options);
  const multi = !!vals && MULTI_OPS.includes(op);
  const pickField = (f: FilterField) => { setField(f); setOp(FIELD_OPS[f][0][0]); setValue(""); setPicked([]); setFind(""); };
  const add = () => {
    if (multi && !picked.length) return;
    const v = multi ? picked.join("||") : vals ? value || vals[0]?.[0] || "" : op === "never" ? "" : value || (field === "birthday" || field === "homeiversary" ? "14" : "30");
    go([...working, { field, op, value: v }]); setBuilding(false); setPicked([]);
  };

  return (
    <div className="relative mt-3 flex flex-wrap items-center gap-1.5">
      {working.length ? working.map((f, i) => (
        <span key={i} className="inline-flex items-center gap-1 rounded-full border border-misty bg-white py-0.5 pl-3 pr-1 text-sm">{describeFilter(f)}
          <button type="button" aria-label={`Remove filter ${describeFilter(f)}`} className="grid size-5 place-items-center rounded-full muted hover:bg-sunken hover:text-bad" onClick={() => go(working.filter((_, j) => j !== i))}>×</button></span>
      )) : <span className="text-sm muted">No filters. Showing everyone.</span>}
      <button type="button" aria-expanded={building} className={`rounded-full border px-3 py-0.5 text-sm font-semibold text-accent hover:bg-sunken ${building ? "border-accent bg-accent-soft" : "border-dashed border-rabbit"}`} onClick={() => setBuilding(!building)}>+ Add filter</button>
      {working.length > 0 && !list && <button type="button" className="text-sm muted underline hover:text-charcoal" onClick={() => go([])}>Clear all</button>}
      {changed && (
        <span className="ml-auto flex gap-1.5">
          {list && <button type="button" className="btn" onClick={() => go(saved)}>Reset</button>}
          <button type="button" className="btn" onClick={() => setSaving(true)}>{list ? "Save as new list" : "Save as smart list"}</button>
          {list && <button type="button" className="btn btn-primary" disabled={pending} onClick={() => start(async () => { const r = await saveSmartListFilters(list.id, working); if (!r.ok) setError(r.error); else router.push(`/people?list=${list.id}`); })}>Save changes</button>}
        </span>
      )}
      {building && (
        <div ref={pop} role="dialog" aria-label="Add a filter" className="absolute left-0 top-full z-20 mt-2 w-[min(560px,calc(100vw-2rem))] rounded-xl border border-misty bg-white p-3.5 shadow-[0_12px_32px_rgba(56,50,50,.18)]">
          <div className="flex gap-2">
            <select className="input flex-1" aria-label="Field" value={field} onChange={(e) => pickField(e.target.value as FilterField)}>
              {Object.entries(FIELD_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select className="input w-auto" aria-label="Condition" value={op} onChange={(e) => setOp(e.target.value)}>
              {FIELD_OPS[field].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          {multi ? (
            <>
              {vals!.length > 8 && (
                <div className="relative mt-2.5">
                  <svg aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                  <input className="input pl-8" value={find} onChange={(e) => setFind(e.target.value)} placeholder={`Search ${FIELD_LABELS[field].toLowerCase()}…`} aria-label="Search options" autoFocus />
                </div>
              )}
              <div className="mt-2.5 flex max-h-52 flex-wrap gap-1.5 overflow-y-auto">
                {vals!.filter(([, l]) => !find.trim() || l.toLowerCase().includes(find.trim().toLowerCase())).map(([k, l]) => {
                  const on = picked.includes(k);
                  return <button key={k} type="button" aria-pressed={on} onClick={() => setPicked(on ? picked.filter((x) => x !== k) : [...picked, k])}
                    className={`rounded-full border px-3 py-0.5 text-sm ${on ? "border-accent bg-accent text-white" : "border-misty bg-white hover:bg-sunken"}`}>{on && "✓ "}{l}</button>;
                })}
              </div>
            </>
          ) : vals ? (
            <select className="input mt-2.5" aria-label="Value" value={value} onChange={(e) => setValue(e.target.value)}>
              {vals.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          ) : DAY_FIELDS.includes(field) && op !== "never" && (
            <div className="mt-2.5 flex items-center gap-2"><input className="input w-24" type="number" min={0} aria-label="Days" value={value} placeholder={field === "birthday" || field === "homeiversary" ? "14" : "30"} onChange={(e) => setValue(e.target.value)} /><span className="text-sm muted">{field === "birthday" || field === "homeiversary" ? "days" : "days ago"}</span></div>
          )}
          <div className="mt-3 flex items-center gap-2 border-t border-misty/70 pt-3">
            {multi && <span className="text-sm muted">{picked.length} picked</span>}
            <span className="ml-auto" />
            <button type="button" className="btn" onClick={() => setBuilding(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={multi && !picked.length} onClick={add}>Add filter</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="w-full text-sm text-bad">{error}</p>}
      {saving && <SaveAsModal filters={working} collections={collections} defaultCollection={newCollectionId ?? collections[0]?.id} onClose={() => setSaving(false)} />}
    </div>
  );
}

function SaveAsModal({ filters, collections, defaultCollection, onClose }: { filters: Filter[]; collections: { id: string; name: string }[]; defaultCollection?: string; onClose: () => void }) {
  const [col, setCol] = useState(defaultCollection ?? "__new");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Modal title="Save smart list" onClose={onClose}>
      <form className="flex flex-col gap-3" action={(f) => start(async () => {
        const r = await createSmartList({ name: String(f.get("name")), collectionId: col, newCollection: String(f.get("newCollection") ?? ""), filters });
        if (!r.ok) { setError(r.error); return; }
        onClose(); router.push(`/people?list=${r.data!.id}`);
      })}>
        <label className="label">Name<input className="input" name="name" required autoFocus /></label>
        <label className="label">Collection
          <select className="input" value={col} onChange={(e) => setCol(e.target.value)}>
            {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="__new">+ New collection…</option>
          </select>
        </label>
        {col === "__new" && <label className="label">New collection name<input className="input" name="newCollection" required /></label>}
        <p className="text-sm muted">{filters.length ? filters.map(describeFilter).join(" · ") : "No filters: shows everyone."}</p>
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={pending}>Save</button></div>
      </form>
    </Modal>
  );
}
