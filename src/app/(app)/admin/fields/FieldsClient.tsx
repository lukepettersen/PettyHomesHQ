"use client";

import { SaveBar } from "@/components/SaveBar";
import { FIELD_TYPE_LABEL, FIELD_TYPES } from "@/lib/customFields";
import { saveCustomFields } from "../actions";
import { useRows } from "../useRows";

type Row = { id?: string; name: string; type: string; options: string[]; used?: number };

export function FieldsClient({ fields }: { fields: Row[] }) {
  const t = useRows(fields, (rows) => saveCustomFields(rows.map(({ id, name, type, options }) => ({ id, name, type: type as never, options }))));
  const removedInUse = fields.filter((f) => f.used && !t.rows.some((r) => r.id === f.id));
  return (
    <section className="card">
      <ul>
        {t.rows.map((r, i) => (
          <li key={r.id ?? `new${i}`} className="flex flex-wrap items-center gap-2 border-b border-misty/60 px-4 py-2 last:border-0">
            <input aria-label="Field name" className="input min-w-[180px] flex-1" value={r.name} onChange={(e) => t.patch(i, { name: e.target.value })} />
            <select aria-label="Field type" className="input w-auto" value={r.type} onChange={(e) => t.patch(i, { type: e.target.value })}>
              {FIELD_TYPES.map((k) => <option key={k} value={k}>{FIELD_TYPE_LABEL[k]}</option>)}
            </select>
            {r.type === "dropdown" && (
              <input aria-label="Choices, separated by commas" placeholder="Choices, separated by commas" className="input min-w-[200px] flex-1"
                defaultValue={r.options.join(", ")} onBlur={(e) => t.patch(i, { options: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
            )}
            {r.used ? <span className="text-xs muted">{r.used} filled in</span> : null}
            <span className="ml-auto flex gap-1">
              <button type="button" className="btn px-2" aria-label="Move up" disabled={i === 0} onClick={() => t.move(i, -1)}>↑</button>
              <button type="button" className="btn px-2" aria-label="Move down" disabled={i === t.rows.length - 1} onClick={() => t.move(i, 1)}>↓</button>
              <button type="button" className="btn px-2 text-bad" aria-label={`Remove ${r.name}`} onClick={() => t.remove(i)}>×</button>
            </span>
          </li>
        ))}
        {t.rows.length === 0 && <li className="px-4 py-6 text-center muted">No custom fields yet.</li>}
      </ul>
      <div className="border-t border-misty px-4 py-3">
        <button type="button" className="btn" onClick={() => t.add({ name: "New field", type: "text", options: [] })}>+ Add field</button>
      </div>
      {removedInUse.length > 0 && <p className="px-4 pb-3 text-sm text-bad">Saving removes {removedInUse.map((f) => `"${f.name}"`).join(", ")} and what&apos;s filled in for everyone.</p>}
      <SaveBar dirty={t.dirty} pending={t.pending} error={t.error} onDiscard={t.discard} onSave={t.save} />
    </section>
  );
}
