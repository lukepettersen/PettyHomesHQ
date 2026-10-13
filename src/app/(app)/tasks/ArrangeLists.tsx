"use client";

import { useState, useTransition } from "react";
import type { ListRow } from "@/server/tasks";
import { saveListOrder } from "./actions";

type Row = { key: string; id: string | null; name: string; builtin: boolean; showOnToday: boolean };

/** Edit columns: order every list, untick On Today, rename/add/delete your own lists. Save / Cancel. */
export function ArrangeLists({ lists, onClose, notify }: { lists: ListRow[]; onClose: (saved: boolean) => void; notify: (m: string) => void }) {
  const [rows, setRows] = useState<Row[]>(() => lists.map((l) => ({ key: l.id, id: l.id, name: l.name, builtin: !!l.builtin, showOnToday: l.showOnToday })));
  const [deleted, setDeleted] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const move = (i: number, j: number) => setRows((r) => { const n = r.slice(); [n[i], n[j]] = [n[j], n[i]]; return n; });
  const patch = (key: string, p: Partial<Row>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const add = () => {
    const n = newName.trim();
    if (!n) return;
    if (rows.some((r) => r.name.toLowerCase() === n.toLowerCase())) { setError(`There's already a list called "${n}".`); return; }
    setRows((r) => [...r, { key: `new-${Date.now()}`, id: null, name: n, builtin: false, showOnToday: true }]);
    setNewName(""); setError("");
  };
  const save = () => start(async () => {
    const r = await saveListOrder({ rows: rows.map((x) => ({ id: x.id, name: x.name, showOnToday: x.showOnToday })), deleted });
    if (!r.ok) { setError(r.error); return; }
    notify("Saved. The sidebar and Today columns use this order.");
    onClose(true);
  });

  return (
    <section aria-label="Lists and Today columns" className="card flex flex-col gap-1 p-3">
      <div className="mb-1 flex flex-col">
        <b>Lists and Today columns</b>
        <span className="text-xs muted">Use the arrows to change the order. Unticked lists stay in the sidebar but don&apos;t get a column on Today.</span>
      </div>
      {rows.map((r, i) => (
        <div key={r.key} className="flex flex-wrap items-center gap-2 border-t border-misty/60 py-1.5 first:border-0">
          <span className="w-5 text-right text-xs muted">{i + 1}</span>
          {r.builtin
            ? <span className="min-w-[160px] flex-1 font-medium">{r.name} <span className="text-xs font-normal muted">built in</span></span>
            : <input aria-label="List name" className="input min-w-[160px] flex-1" value={r.name} onChange={(e) => patch(r.key, { name: e.target.value })} />}
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={r.showOnToday} onChange={(e) => patch(r.key, { showOnToday: e.target.checked })} /> On Today
          </label>
          <span className="flex gap-1">
            <button type="button" className="btn px-2 py-0.5" aria-label={`Move ${r.name} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>↑</button>
            <button type="button" className="btn px-2 py-0.5" aria-label={`Move ${r.name} down`} disabled={i === rows.length - 1} onClick={() => move(i, i + 1)}>↓</button>
            {r.builtin
              ? <span className="inline-block w-[30px]" />
              : <button type="button" className="btn btn-danger px-2 py-0.5" aria-label={`Delete ${r.name}`} onClick={() => { setRows((x) => x.filter((y) => y.key !== r.key)); if (r.id) setDeleted((d) => [...d, r.id!]); }}>×</button>}
          </span>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 border-t border-misty/60 pt-2">
        <span className="w-5 text-right text-xs muted">+</span>
        <input aria-label="New list name" placeholder="New list name" className="input min-w-[160px] flex-1" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <button type="button" className="btn" onClick={add}>Add list</button>
      </div>
      {deleted.length > 0 && <p className="text-xs muted">Deleting a list keeps its tasks; they move to Clients or Misc.</p>}
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      <div className="mt-1 flex justify-end gap-2">
        <button type="button" className="btn" disabled={pending} onClick={() => onClose(false)}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={save}>Save</button>
      </div>
    </section>
  );
}
