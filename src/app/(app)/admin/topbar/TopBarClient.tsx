"use client";

import { SaveBar } from "@/components/SaveBar";
import { NAV_ITEMS, type NavKey } from "@/lib/nav";
import { useRows } from "../useRows";
import { saveNavOrder } from "./actions";

/** Up/down arrows to reorder the top bar's tabs; Save / Discard. */
export function TopBarClient({ order }: { order: NavKey[] }) {
  const t = useRows(order, (rows) => saveNavOrder(rows));
  const label = (k: NavKey) => NAV_ITEMS.find((i) => i.key === k)!.label;
  return (
    <section className="card max-w-md">
      <ol>
        {t.rows.map((k, i) => (
          <li key={k} className="flex items-center gap-2 border-b border-misty/60 px-4 py-2 last:border-0">
            <span className="w-5 text-sm muted">{i + 1}</span>
            <span className="flex-1 font-semibold">{label(k)}{k === "whiteboard" && <span className="ml-2 text-xs font-normal muted">only you see it</span>}</span>
            <button type="button" className="btn px-2" aria-label={`Move ${label(k)} up`} disabled={i === 0} onClick={() => t.move(i, -1)}>↑</button>
            <button type="button" className="btn px-2" aria-label={`Move ${label(k)} down`} disabled={i === t.rows.length - 1} onClick={() => t.move(i, 1)}>↓</button>
          </li>
        ))}
      </ol>
      <SaveBar dirty={t.dirty} pending={t.pending} error={t.error} onDiscard={t.discard} onSave={() => t.save()} />
    </section>
  );
}
