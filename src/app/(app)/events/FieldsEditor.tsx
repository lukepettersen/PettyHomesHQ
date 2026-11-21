"use client";

import type { EventField, FieldType } from "@/lib/events";
import { fieldKey } from "@/lib/events";

export type FieldDraft = { key?: string; label: string; type: FieldType; options: string; required: boolean };
export const toDraft = (f: EventField): FieldDraft => ({ key: f.key, label: f.label, type: f.type, options: f.options.join("\n"), required: f.required });
export const fromDraft = (f: FieldDraft) => ({ key: f.key, label: f.label, type: f.type, options: f.options, required: f.required });

const TYPES: [FieldType, string][] = [["text", "Short answer"], ["long", "Long answer"], ["number", "Number"], ["select", "Pick one"]];

/** Signup questions: each becomes a merge field ({pie_flavor}) and a box on the signup page. */
export function FieldsEditor({ fields, onChange }: { fields: FieldDraft[]; onChange: (f: FieldDraft[]) => void }) {
  const set = (i: number, p: Partial<FieldDraft>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...p } : f)));
  const move = (i: number, d: -1 | 1) => { const r = [...fields]; const j = i + d; if (j < 0 || j >= r.length) return; [r[i], r[j]] = [r[j], r[i]]; onChange(r); };
  return (
    <div>
      <ol className="space-y-2">
        {fields.map((f, i) => (
          <li key={i} className="rounded-lg border border-misty p-2">
            <div className="flex flex-wrap items-end gap-2">
              <label className="label min-w-[12rem] flex-1">Question<input className="input mt-1" value={f.label} onChange={(e) => set(i, { label: e.target.value, key: f.key && f.key !== fieldKey(f.label) ? f.key : undefined })} placeholder="Pie flavor" /></label>
              <label className="label">Kind<select className="input mt-1" value={f.type} onChange={(e) => set(i, { type: e.target.value as FieldType })}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              <label className="flex items-center gap-1.5 pb-2 text-sm"><input type="checkbox" checked={f.required} onChange={(e) => set(i, { required: e.target.checked })} />Required</label>
              <span className="flex gap-1 pb-1">
                <button type="button" className="btn px-2 py-1 text-xs" aria-label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button type="button" className="btn px-2 py-1 text-xs" aria-label={`Move question ${i + 1} down`} disabled={i === fields.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button type="button" className="btn px-2 py-1 text-xs text-bad" aria-label={`Remove question ${i + 1}`} onClick={() => onChange(fields.filter((_, j) => j !== i))}>✕</button>
              </span>
            </div>
            {f.type === "select" && <label className="label mt-2 block">Choices (one per line)<textarea className="input mt-1 w-full text-sm" rows={3} value={f.options} onChange={(e) => set(i, { options: e.target.value })} /></label>}
            {f.label.trim() && <p className="mt-1 text-xs muted">Merge field: <code className="rounded bg-sunken px-1">{`{${f.key || fieldKey(f.label)}}`}</code></p>}
          </li>
        ))}
      </ol>
      <button type="button" className="btn mt-2 text-sm" onClick={() => onChange([...fields, { label: "", type: "text", options: "", required: false }])}>+ Add question</button>
    </div>
  );
}
