"use client";

import { useState } from "react";
import { SaveBar } from "@/components/SaveBar";
import { saveTools } from "../actions";
import { useRows } from "../useRows";

type Row = { name: string; url: string };

export function ToolsClient({ tools }: { tools: Row[] }) {
  const t = useRows(tools, (rows) => saveTools(rows));
  const [draft, setDraft] = useState<Row>({ name: "", url: "" });
  return (
    <section className="card">
      <ul>
        {t.rows.map((r, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 border-b border-misty/60 px-4 py-2 last:border-0">
            <input aria-label="Name" className="input w-48" value={r.name} onChange={(e) => t.patch(i, { name: e.target.value })} />
            <input aria-label="Link" className="input min-w-[220px] flex-1" value={r.url} onChange={(e) => t.patch(i, { url: e.target.value })} />
            <span className="flex gap-1">
              <button type="button" className="btn px-2" aria-label="Move up" disabled={i === 0} onClick={() => t.move(i, -1)}>↑</button>
              <button type="button" className="btn px-2" aria-label="Move down" disabled={i === t.rows.length - 1} onClick={() => t.move(i, 1)}>↓</button>
              <button type="button" className="btn px-2 text-bad" aria-label={`Remove ${r.name}`} onClick={() => t.remove(i)}>×</button>
            </span>
          </li>
        ))}
        {t.rows.length === 0 && <li className="px-4 py-6 text-center muted">No tools yet. Add the sites you open every day (MLS, showing service, forms).</li>}
      </ul>
      <form className="flex flex-wrap gap-2 border-t border-misty px-4 py-3" onSubmit={(e) => { e.preventDefault(); if (!draft.name.trim() || !draft.url.trim()) return; t.add({ name: draft.name.trim(), url: draft.url.trim() }); setDraft({ name: "", url: "" }); }}>
        <input aria-label="New tool name" placeholder="Name, e.g. MLS" className="input w-48" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <input aria-label="New tool link" placeholder="Link, e.g. https://…" className="input min-w-[220px] flex-1" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
        <button className="btn">+ Add tool</button>
      </form>
      <SaveBar dirty={t.dirty} pending={t.pending} error={t.error} onDiscard={t.discard} onSave={t.save} />
    </section>
  );
}
