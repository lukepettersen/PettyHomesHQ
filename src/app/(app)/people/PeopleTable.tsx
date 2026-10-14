"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { bulkDelete, bulkUpdate } from "./actions";
import { saveColumns } from "./listActions";
import { Modal } from "@/components/Modal";
import { COLUMNS, columnLabel } from "@/lib/columns";

export type Row = {
  id: string; name: string; phone: string | null; email: string | null; stage: string | null; type: string | null; company: string | null; address: string | null; mailingName: string | null; kids: string | null;
  assigned: string | null; source: string | null; tags: string[]; followUpDays: number | null; dueForTouch: boolean;
  lastDays: number | null; callDays: number | null; textDays: number | null; emailDays: number | null; created: string | null;
  birthdayIn: number | null; birthday: string | null; homeiversary: string | null;
};
type Opt = { stages: { id: string; name: string }[]; tags: string[]; followUp: number[]; team: { id: string; name: string }[] };

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const md = (mmdd: string | null) => (mmdd ? `${MON[+mmdd.slice(0, 2) - 1]} ${+mmdd.slice(3, 5)}` : null);
const ago = (d: number | null) => (d === null ? null : d === 0 ? "Today" : `${d}d ago`);
const dash = <span className="muted">—</span>;
/** What a column shows for a person, and the value it sorts by. */
function cellOf(k: string, r: Row): [React.ReactNode, string | number] {
  switch (k) {
    case "stage": return [r.stage ?? dash, r.stage ?? "~"];
    case "type": return [r.type ?? dash, r.type ?? "~"]; // already the label (Realtor, Lender…)
    case "company": return [r.company ?? dash, r.company ?? "~"];
    case "phone": return [r.phone ?? dash, r.phone ?? "~"];
    case "email": return [r.email ?? dash, r.email ?? "~"];
    case "lastContact": return [ago(r.lastDays) ?? <span className="muted">Never</span>, -(r.lastDays ?? 1e9)];
    case "lastCall": return [ago(r.callDays) ?? <span className="muted">Never</span>, -(r.callDays ?? 1e9)];
    case "lastText": return [ago(r.textDays) ?? <span className="muted">Never</span>, -(r.textDays ?? 1e9)];
    case "lastEmail": return [ago(r.emailDays) ?? <span className="muted">Never</span>, -(r.emailDays ?? 1e9)];
    case "followUp": return [r.followUpDays ? <span className={r.dueForTouch ? "font-semibold text-bad" : ""}>Every {r.followUpDays}d{r.dueForTouch ? " · due" : ""}</span> : dash, r.followUpDays ?? 1e9];
    case "tags": return [<div key="t" className="flex flex-wrap gap-1">{r.tags.slice(0, 3).map((t) => <span key={t} className="chip">{t}</span>)}{r.tags.length > 3 && <span className="text-xs muted">+{r.tags.length - 3}</span>}</div>, r.tags.join(",") || "~"];
    case "source": return [r.source ?? dash, r.source ?? "~"];
    case "assigned": return [r.assigned ?? dash, r.assigned ?? "~"];
    case "address": return [r.address ?? dash, r.address ?? "~"];
    case "mailingName": return [r.mailingName ?? dash, r.mailingName ?? "~"];
    case "kids": return [r.kids ?? dash, r.kids ?? "~"];
    case "birthday": return [r.birthday ? <>{md(r.birthday)}{r.birthdayIn !== null && r.birthdayIn <= 14 ? <span className="text-xs text-accent"> · in {r.birthdayIn}d</span> : null}</> : dash, r.birthdayIn ?? 1e9];
    case "homeiversary": return [md(r.homeiversary) ?? dash, r.homeiversary ?? "~"];
    case "created": return [r.created ? new Date(r.created).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric" }) : dash, r.created ? -Date.parse(r.created) : 0];
    default: return [dash, "~"];
  }
}

export function PeopleTable({ rows, options, canDelete, canExport, exportHref, emptyText, listId, columns, sort, page, pages, total, viewQuery, allIds }: {
  rows: Row[]; options: Opt; canDelete: boolean; canExport: boolean; exportHref: string; emptyText: string; listId: string | null; columns: string[];
  sort: string; page: number; pages: number; total: number; viewQuery: string; allIds: string[];
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  // Sorting and pages are in the address, so Back from a contact returns to the same spot.
  const href = (p: Record<string, string | null>) => { const q = new URLSearchParams(viewQuery); for (const [k, v] of Object.entries(p)) { if (v) q.set(k, v); else q.delete(k); } return `/people${q.size ? `?${q}` : ""}`; };
  const back = (() => { const q = new URLSearchParams(viewQuery); if (page > 1) q.set("page", String(page)); return q.toString(); })();
  const setSort = (k: string) => { router.push(href({ sort: k === "name" ? null : k, page: null })); };
  const [editCols, setEditCols] = useState(false);
  // Column widths: drag a header's right edge. Remembered per list in this browser.
  const widthKey = `hq-colw-${listId ?? "all"}`;
  const [widths, setWidths] = useState<Record<string, number>>({});
  useEffect(() => {
    const t = setTimeout(() => { try { setWidths(JSON.parse(localStorage.getItem(widthKey) ?? "{}")); } catch { /* private window */ } }, 0);
    return () => clearTimeout(t);
  }, [widthKey]);
  const drag = useRef<{ k: string; x: number; w: number } | null>(null);
  const startResize = (k: string, e: React.PointerEvent<HTMLSpanElement>) => {
    e.preventDefault(); e.stopPropagation();
    const th = e.currentTarget.parentElement!;
    drag.current = { k, x: e.clientX, w: th.getBoundingClientRect().width };
    const move = (ev: PointerEvent) => { const d = drag.current; if (d) setWidths((w) => ({ ...w, [d.k]: Math.max(70, Math.round(d.w + ev.clientX - d.x)) })); };
    const up = () => {
      drag.current = null; window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      setWidths((w) => { try { localStorage.setItem(widthKey, JSON.stringify(w)); } catch { /* private window */ } return w; });
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const widthOf = (k: string) => widths[k] ?? (k === "name" ? 240 : k === "tags" || k === "address" || k === "email" ? 220 : 150);
  const [action, setAction] = useState<null | "addTag" | "removeTag" | "stage" | "followUp" | "assign" | "contacted">(null);
  const [value, setValue] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const sorted = rows; // already in order (HQ sorts the whole list, not just this page)
  const all = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const everyone = sel.size >= allIds.length && allIds.length > 0;
  const toggle = (id: string) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); setSel(n); setConfirm(false); };
  const ids = [...sel];

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
  ) : action === "contacted" ? (
    <label className="flex items-center gap-1.5 text-white">Last contact on <input type="date" className="input w-auto text-charcoal" value={value} max={new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" })} onChange={(e) => setValue(e.target.value)} aria-label="Contacted on" /></label>
  ) : action === "assign" ? (
    <select className="input w-auto" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Assign to"><option value="">No one</option>{options.team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
  ) : null;
  const th = (k: string, l: string) => (
    <th key={k} className="relative whitespace-nowrap px-3 py-2" style={{ width: widthOf(k) }}>
      <button type="button" className="uppercase tracking-wide hover:text-charcoal" onClick={() => setSort(k)}>{l}{sort === k ? " ↓" : ""}</button>
      <span role="separator" aria-orientation="vertical" aria-label={`Resize ${l}`} title="Drag to resize; double-click to reset" onPointerDown={(e) => startResize(k, e)}
        onDoubleClick={() => setWidths((w) => { const n = { ...w }; delete n[k]; try { localStorage.setItem(widthKey, JSON.stringify(n)); } catch { /* private window */ } return n; })}
        className="absolute right-0 top-1 bottom-1 w-2 cursor-col-resize border-r-2 border-transparent hover:border-rabbit" />
    </th>
  );

  return (
    <>
      {(ids.length > 0 || msg) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-lg bg-charcoal px-3 py-2 text-sm text-white">
          {ids.length > 0 && <b className="mr-2">{ids.length.toLocaleString()} selected</b>}
          {all && !everyone && total > rows.length && !action && <button type="button" className="rounded-md px-2 py-1 underline hover:bg-white/15" onClick={() => setSel(new Set(allIds))}>Select all {total.toLocaleString()}</button>}
          {ids.length > 0 && !action && <>
            {([["addTag", "Add tag"], ["removeTag", "Remove tag"], ["stage", "Change stage"], ["followUp", "Set follow-up"], ["assign", "Assign"], ["contacted", "Mark contacted"]] as const).map(([k, l]) => (
              <button key={k} type="button" className="rounded-md bg-white/15 px-2.5 py-1 font-semibold hover:bg-white/25" onClick={() => { setAction(k); setValue(k === "contacted" ? new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }) : ""); setMsg(""); }}>{l}</button>
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
      <div className="mt-3 flex justify-end"><button type="button" className="text-sm font-semibold text-accent hover:underline" onClick={() => setEditCols(true)}>Columns</button></div>
      {editCols && <ColumnsModal listId={listId} columns={columns} onClose={() => setEditCols(false)} />}
      <div className="card mt-1 overflow-x-auto">
        <table className="text-left text-sm" style={{ tableLayout: "fixed", width: 40 + widthOf("name") + columns.reduce((n, k) => n + widthOf(k), 0), minWidth: "100%" }}>
          <thead className="border-b border-misty text-xs uppercase tracking-wide muted">
            <tr>
              <th className="px-3 py-2" style={{ width: 40 }}><input type="checkbox" aria-label="Select all" checked={all} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /></th>
              {th("name", "Name")}{columns.map((k) => th(k, columnLabel(k)))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} className={`border-b border-misty/60 last:border-0 hover:bg-paper ${sel.has(r.id) ? "bg-accent-soft/60" : ""}`}>
                <td className="px-3 py-2"><input type="checkbox" aria-label={`Select ${r.name}`} checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="truncate px-3 py-2"><Link href={`/people/${r.id}${back ? `?back=${encodeURIComponent(back)}` : "?back="}`} className="link">{r.name}</Link>{r.phone && !columns.includes("phone") && <div className="text-xs muted">{r.phone}</div>}</td>
                {columns.map((k) => <td key={k} className={`px-3 py-2 ${k === "tags" ? "" : "truncate"}`}>{cellOf(k, r)[0]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-8 text-center muted">{emptyText}</p>}
      </div>
      {pages > 1 && (
        <nav aria-label="Pages" className="mt-2 flex items-center justify-center gap-3 text-sm">
          {page > 1 ? <Link className="btn" href={href({ page: page > 2 ? String(page - 1) : null })}>‹ Previous</Link> : <span className="btn opacity-40">‹ Previous</span>}
          <span>Page {page} of {pages} · {total.toLocaleString()} people</span>
          {page < pages ? <Link className="btn" href={href({ page: String(page + 1) })}>Next ›</Link> : <span className="btn opacity-40">Next ›</span>}
        </nav>
      )}
      {canExport && rows.length > 0 && <a href={exportHref} className="mt-2 inline-block text-sm font-semibold text-accent hover:underline">Export these {total.toLocaleString()} to CSV</a>}
    </>
  );
}

/** Pick and order the columns for this list (Save / Cancel). */
function ColumnsModal({ listId, columns, onClose }: { listId: string | null; columns: string[]; onClose: () => void }) {
  const router = useRouter();
  const [cols, setCols] = useState(columns);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const move = (i: number, d: number) => { const n = [...cols]; [n[i], n[i + d]] = [n[i + d], n[i]]; setCols(n); };
  const rest = COLUMNS.filter(([k]) => !cols.includes(k));
  return (
    <Modal title={listId ? "Columns for this list" : "Columns for All people"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-sm muted">Name is always first. Use the arrows to change the order.</p>
        <ul className="flex flex-col gap-1">
          {cols.map((k, i) => (
            <li key={k} className="flex items-center gap-2 rounded-md bg-sunken px-2.5 py-1.5 text-sm">
              <span className="flex-1 font-semibold">{columnLabel(k)}</span>
              <button type="button" className="px-1.5 disabled:opacity-30" aria-label={`Move ${columnLabel(k)} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button type="button" className="px-1.5 disabled:opacity-30" aria-label={`Move ${columnLabel(k)} down`} disabled={i === cols.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button type="button" className="px-1.5 muted hover:text-bad" aria-label={`Remove ${columnLabel(k)}`} onClick={() => setCols(cols.filter((x) => x !== k))}>×</button>
            </li>
          ))}
        </ul>
        {rest.length > 0 && (
          <div>
            <span className="text-xs font-semibold muted">Add a column:</span>
            <div className="mt-1 flex flex-wrap gap-1.5">{rest.map(([k, l]) => <button key={k} type="button" className="chip hover:bg-misty" onClick={() => setCols([...cols, k])}>+ {l}</button>)}</div>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={pending || !cols.length} onClick={() => start(async () => { const r = await saveColumns(listId, cols); if (!r.ok) { setError(r.error); return; } onClose(); router.refresh(); })}>Save</button>
        </div>
      </div>
    </Modal>
  );
}
