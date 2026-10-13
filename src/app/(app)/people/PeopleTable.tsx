"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { bulkDelete, bulkUpdate } from "./actions";

export type Row = { id: string; name: string; phone: string | null; stage: string | null; lastDays: number | null; followUpDays: number | null; dueForTouch: boolean; tags: string[]; source: string | null };
type Opt = { stages: { id: string; name: string }[]; tags: string[]; followUp: number[]; team: { id: string; name: string }[] };
type Sort = "name" | "stage" | "last";

export function PeopleTable({ rows, options, canDelete, canExport, exportHref, emptyText }: { rows: Row[]; options: Opt; canDelete: boolean; canExport: boolean; exportHref: string; emptyText: string }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<Sort>("name");
  const [action, setAction] = useState<null | "addTag" | "removeTag" | "stage" | "followUp" | "assign">(null);
  const [value, setValue] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const sorted = [...rows].sort(sort === "name" ? (a, b) => a.name.localeCompare(b.name) : sort === "stage" ? (a, b) => (a.stage ?? "~").localeCompare(b.stage ?? "~") : (a, b) => (b.lastDays ?? 1e9) - (a.lastDays ?? 1e9));
  const all = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const toggle = (id: string) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); setSel(n); setConfirm(false); };
  const ids = [...sel].filter((id) => rows.some((r) => r.id === id));

  function apply() {
    if (!action) return;
    start(async () => {
      const r = await bulkUpdate({ ids, action, value });
      if (!r.ok) { setMsg(r.error); return; }
      setMsg(`Updated ${ids.length} ${ids.length === 1 ? "person" : "people"}.`); setAction(null); setValue(""); router.refresh();
    });
  }
  const valueInput = action === "addTag" || action === "removeTag" ? (
    <><input className="input w-40" list="bulk-tags" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Tag" aria-label="Tag" autoFocus /><datalist id="bulk-tags">{options.tags.map((t) => <option key={t} value={t} />)}</datalist></>
  ) : action === "stage" ? (
    <select className="input w-auto" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Stage"><option value="">No stage</option>{options.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
  ) : action === "followUp" ? (
    <select className="input w-auto" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Follow-up"><option value="">Not set</option>{options.followUp.map((d) => <option key={d} value={d}>Every {d} days</option>)}</select>
  ) : action === "assign" ? (
    <select className="input w-auto" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Assign to"><option value="">No one</option>{options.team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
  ) : null;
  const th = (k: Sort, l: string) => <th className="px-3 py-2"><button type="button" className="uppercase tracking-wide hover:text-charcoal" onClick={() => setSort(k)}>{l}{sort === k ? " ↓" : ""}</button></th>;

  return (
    <>
      {(ids.length > 0 || msg) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-lg bg-charcoal px-3 py-2 text-sm text-white">
          {ids.length > 0 && <b className="mr-2">{ids.length} selected</b>}
          {ids.length > 0 && !action && <>
            {([["addTag", "Add tag"], ["removeTag", "Remove tag"], ["stage", "Change stage"], ["followUp", "Set follow-up"], ["assign", "Assign"]] as const).map(([k, l]) => (
              <button key={k} type="button" className="rounded-md bg-white/15 px-2.5 py-1 font-semibold hover:bg-white/25" onClick={() => { setAction(k); setValue(""); setMsg(""); }}>{l}</button>
            ))}
            {canExport && <a className="rounded-md bg-white/15 px-2.5 py-1 font-semibold hover:bg-white/25" href={`/api/export/people?ids=${ids.join(",")}`}>Export</a>}
            {canDelete && <button type="button" className="rounded-md bg-white/15 px-2.5 py-1 font-semibold text-red-200 hover:bg-white/25" disabled={pending}
              onClick={() => { if (!confirm) { setConfirm(true); return; } start(async () => { const r = await bulkDelete(ids); if (!r.ok) setMsg(r.error); else { setMsg(`Moved ${r.data?.count} to Trash.`); setSel(new Set()); setConfirm(false); router.refresh(); } }); }}>
              {confirm ? `Click again to delete ${ids.length}` : "Delete"}</button>}
            <button type="button" className="ml-auto rounded-md px-2.5 py-1 hover:bg-white/15" onClick={() => { setSel(new Set()); setConfirm(false); }}>Clear</button>
          </>}
          {action && <span className="flex flex-wrap items-center gap-1.5 text-charcoal">{valueInput}<button type="button" className="btn btn-primary" disabled={pending} onClick={apply}>Apply</button><button type="button" className="btn" onClick={() => setAction(null)}>Cancel</button></span>}
          {msg && <span className="ml-2">{msg}</span>}
        </div>
      )}
      <div className="card mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-misty text-xs uppercase tracking-wide muted">
            <tr>
              <th className="w-8 px-3 py-2"><input type="checkbox" aria-label="Select all" checked={all} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /></th>
              {th("name", "Name")}{th("stage", "Stage")}{th("last", "Last contact")}<th className="px-3 py-2">Follow up</th><th className="px-3 py-2">Tags</th><th className="px-3 py-2">Source</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} className={`border-b border-misty/60 last:border-0 hover:bg-paper ${sel.has(r.id) ? "bg-accent-soft/60" : ""}`}>
                <td className="px-3 py-2"><input type="checkbox" aria-label={`Select ${r.name}`} checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="px-3 py-2"><Link href={`/people/${r.id}`} className="link">{r.name}</Link>{r.phone && <div className="text-xs muted">{r.phone}</div>}</td>
                <td className="px-3 py-2">{r.stage ?? <span className="muted">—</span>}</td>
                <td className="px-3 py-2">{r.lastDays === null ? <span className="muted">Never</span> : r.lastDays === 0 ? "Today" : `${r.lastDays}d ago`}</td>
                <td className="px-3 py-2">{r.followUpDays ? <span className={r.dueForTouch ? "font-semibold text-bad" : ""}>Every {r.followUpDays}d{r.dueForTouch ? " · due" : ""}</span> : <span className="muted">—</span>}</td>
                <td className="px-3 py-2"><div className="flex flex-wrap gap-1">{r.tags.slice(0, 3).map((t) => <span key={t} className="chip">{t}</span>)}{r.tags.length > 3 && <span className="text-xs muted">+{r.tags.length - 3}</span>}</div></td>
                <td className="px-3 py-2">{r.source ?? <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-8 text-center muted">{emptyText}</p>}
      </div>
      {canExport && rows.length > 0 && <a href={exportHref} className="mt-2 inline-block text-sm font-semibold text-accent hover:underline">Export these {rows.length} to CSV</a>}
    </>
  );
}
