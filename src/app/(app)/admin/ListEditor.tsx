"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SaveBar } from "@/components/SaveBar";

export type Item = { id?: string; name: string; count?: number };
type Result = { ok: true } | { ok: false; error: string };

/** Rename, reorder, add and remove a list of names, saved together. */
export function ListEditor({ title, help, items, addLabel, onSave, ordered = true, countLabel }: {
  title: string; help: string; items: Item[]; addLabel: string; onSave: (items: Item[]) => Promise<Result>; ordered?: boolean; countLabel?: string;
}) {
  const [rows, setRows] = useState(items);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const dirty = JSON.stringify(rows) !== JSON.stringify(items);
  const move = (i: number, d: number) => { const r = [...rows]; [r[i], r[i + d]] = [r[i + d], r[i]]; setRows(r); };
  const add = () => { const n = draft.trim(); if (!n) return; setRows([...rows, { name: n }]); setDraft(""); };

  return (
    <section className="card mb-4">
      <div className="border-b border-misty px-4 py-3"><h2 className="font-bold">{title}</h2><p className="text-sm muted">{help}</p></div>
      <ul>
        {rows.map((r, i) => (
          <li key={r.id ?? `new${i}`} className="flex items-center gap-2 border-b border-misty/60 px-4 py-2 last:border-0">
            {ordered && <span className="w-5 text-xs muted">{i + 1}</span>}
            <input className="input flex-1" value={r.name} aria-label={`${title} name`} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
            {countLabel && <span className="w-24 text-right text-xs muted">{r.count ?? 0} {countLabel}</span>}
            {ordered && <>
              <button type="button" className="btn px-2" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button type="button" className="btn px-2" aria-label="Move down" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>↓</button>
            </>}
            <button type="button" className="btn px-2 text-bad" aria-label={`Remove ${r.name}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>×</button>
          </li>
        ))}
      </ul>
      <form className="flex gap-2 border-t border-misty px-4 py-3" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input className="input max-w-xs" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={addLabel} aria-label={addLabel} />
        <button className="btn">+ Add</button>
      </form>
      <SaveBar dirty={dirty} pending={pending} error={error}
        onDiscard={() => { setRows(items); setError(""); }}
        onSave={() => start(async () => { setError(""); const r = await onSave(rows); if (!r.ok) setError(r.error); else router.refresh(); })} />
    </section>
  );
}
