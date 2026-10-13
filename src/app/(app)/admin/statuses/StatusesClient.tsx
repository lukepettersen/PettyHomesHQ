"use client";

import { SaveBar } from "@/components/SaveBar";
import type { StatusRow } from "@/server/files";
import { saveStages } from "../../pipeline/actions";
import { UNTIL_OPTIONS } from "../../pipeline/StageEditor";
import { useRows } from "../useRows";

type Row = { id: string | null; name: string; untilDate: string | null };

export function StatusesClient({ title, kind, rows, counts }: { title: string; kind: "buyer" | "listing" | "uc"; rows: StatusRow[]; counts: Record<string, number> }) {
  const t = useRows<Row>(rows.map((r) => ({ id: r.id, name: r.name, untilDate: r.untilDate })), (list) => saveStages({ kind, rows: list.map((r) => ({ ...r, untilDate: r.untilDate as never })) }));
  return (
    <section className="card mb-4">
      <div className="border-b border-misty px-4 py-3">
        <h2 className="font-bold">{title}</h2>
        {kind === "uc" && <p className="text-sm muted">A contract sits in the first column whose date is still open; with nothing open it sits in the last column.</p>}
      </div>
      <ul>
        {t.rows.map((r, i) => {
          const n = r.id ? counts[r.id] ?? 0 : 0;
          return (
            <li key={r.id ?? `new${i}`} className="flex flex-wrap items-center gap-2 border-b border-misty/60 px-4 py-2 last:border-0">
              <span className="w-5 text-xs muted">{i + 1}</span>
              <input className="input min-w-[160px] flex-1" aria-label={`${title} stage name`} value={r.name} onChange={(e) => t.patch(i, { name: e.target.value })} />
              {kind === "uc" && (
                <select className="input w-auto" aria-label="Stays here until" value={r.untilDate ?? "closing"} onChange={(e) => t.patch(i, { untilDate: e.target.value })}>
                  {UNTIL_OPTIONS.map(([k, l]) => <option key={k} value={k}>Until {l}</option>)}
                </select>
              )}
              {kind !== "uc" && <span className="w-20 text-right text-xs muted">{n} client{n === 1 ? "" : "s"}</span>}
              <button type="button" className="btn px-2" aria-label="Move up" disabled={i === 0} onClick={() => t.move(i, -1)}>↑</button>
              <button type="button" className="btn px-2" aria-label="Move down" disabled={i === t.rows.length - 1} onClick={() => t.move(i, 1)}>↓</button>
              <button type="button" className="btn px-2 text-bad" aria-label={`Remove ${r.name}`} disabled={n > 0} title={n ? "Move these clients first" : undefined} onClick={() => t.remove(i)}>×</button>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-misty px-4 py-3">
        <button type="button" className="btn" onClick={() => t.add({ id: null, name: "New stage", untilDate: kind === "uc" ? "closing" : null })}>+ Add stage</button>
      </div>
      <SaveBar dirty={t.dirty} pending={t.pending} error={t.error} onDiscard={t.discard} onSave={t.save} />
    </section>
  );
}
