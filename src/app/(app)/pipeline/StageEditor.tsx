"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { StatusRow } from "@/server/files";
import { saveStages } from "./actions";

export const UNTIL_OPTIONS: [string, string][] = [["inspection", "Inspection deadline"], ["hoaRescission", "HOA doc rescission"], ["writtenStatement", "Written Statement"], ["closing", "Closing"]];
type Row = { key: string; id: string | null; name: string; untilDate: string | null };

/** Edit stages right on the board: rename, ← →, add, delete. Save / Cancel (SPEC.md §7.3). */
export function StageEditor({ kind, rows: initial, counts, onDone }: { kind: "buyer" | "listing" | "uc"; rows: StatusRow[]; counts: Record<string, number>; onDone: () => void }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initial.map((r) => ({ key: r.id, id: r.id, name: r.name, untilDate: r.untilDate })));
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const uc = kind === "uc";
  const patch = (i: number, p: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const move = (i: number, d: number) => { const n = [...rows]; [n[i], n[i + d]] = [n[i + d], n[i]]; setRows(n); };
  const save = () => start(async () => {
    setError("");
    const r = await saveStages({ kind, rows: rows.map((x) => ({ id: x.id, name: x.name, untilDate: uc ? (x.untilDate as never) : null })) });
    if (!r.ok) { setError(r.error); return; }
    router.refresh(); onDone();
  });
  return (
    <div className="mt-3">
      <div className="flex gap-3 overflow-x-auto pb-3">
        {rows.map((r, i) => {
          const n = r.id ? counts[r.id] ?? 0 : 0;
          return (
            <div key={r.key} className="flex w-[240px] flex-none flex-col gap-2 rounded-lg border border-misty bg-white p-3">
              <input aria-label="Stage name" className="input font-semibold" value={r.name} onChange={(e) => patch(i, { name: e.target.value })} />
              {uc && (
                <select aria-label="Stays here until" className="input" value={r.untilDate ?? ""} onChange={(e) => patch(i, { untilDate: e.target.value })}>
                  <option value="" disabled>Until…</option>
                  {UNTIL_OPTIONS.map(([k, l]) => <option key={k} value={k}>Until {l}</option>)}
                </select>
              )}
              <span className="flex gap-1">
                <button type="button" className="btn px-2" aria-label={`Move ${r.name} left`} disabled={i === 0} onClick={() => move(i, -1)}>←</button>
                <button type="button" className="btn px-2" aria-label={`Move ${r.name} right`} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>→</button>
                <button type="button" className="btn px-2 text-bad" aria-label={`Delete ${r.name}`} disabled={rows.length === 1 || n > 0} title={n ? "Move these clients first" : undefined} onClick={() => setRows(rows.filter((_, j) => j !== i))}>×</button>
              </span>
              <span className="text-xs muted">{n ? `${n} client${n === 1 ? "" : "s"} here` : "Empty"}</span>
            </div>
          );
        })}
        <button type="button" className="flex w-[160px] flex-none items-center justify-center rounded-lg border border-dashed border-misty font-semibold text-accent hover:bg-white"
          onClick={() => setRows([...rows, { key: `new${Date.now()}`, id: null, name: "New stage", untilDate: uc ? "closing" : null }])}>+ Add stage</button>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto text-xs muted">{uc ? "Each column holds contracts until its date is met. " : "Renaming moves everyone in that stage. "}Changes also show in Admin → Client statuses.</span>
        {error && <span role="alert" className="text-sm text-bad">{error}</span>}
        <button type="button" className="btn" disabled={pending} onClick={onDone}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={save}>Save stages</button>
      </div>
    </div>
  );
}
