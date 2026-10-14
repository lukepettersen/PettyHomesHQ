"use client";

import { useEffect, useRef, useState } from "react";
import { partnerLabel, type Partner } from "@/lib/partners";

/** "Choose a lender from your contacts": search-as-you-type over partner contacts of one type (SPEC.md §6.4). */
export function PartnerPicker({ type, picked, onPick, onClear }: { type: string | null; picked: { id: string; name: string } | null; onPick: (p: Partner) => void; onClear: () => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Partner[]>([]);
  const [i, setI] = useState(0);
  const seq = useRef(0);
  const noun = (partnerLabel(type) ?? "partner").toLowerCase();

  useEffect(() => {
    if (!open) return;
    const n = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/partners?type=${encodeURIComponent(type ?? "")}&q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const j = r.ok ? ((await r.json()) as { results: Partner[] }) : { results: [] };
        if (n === seq.current) { setResults(j.results); setI(0); }
      } catch { /* offline */ }
    }, 150);
    return () => clearTimeout(t);
  }, [q, open, type]);

  if (picked) return (
    <div className="col-span-full flex items-center gap-2 rounded-md bg-accent-soft px-2.5 py-1.5 text-sm">
      <span>From your contacts: <b>{picked.name}</b></span>
      <button type="button" className="ml-auto text-xs font-semibold text-accent hover:underline" onClick={onClear}>Change</button>
    </div>
  );
  const choose = (p: Partner) => { onPick(p); setQ(""); setOpen(false); };
  return (
    <div className="relative col-span-full">
      <input className="input" role="combobox" aria-expanded={open && results.length > 0} aria-controls={`pp-${type}`} aria-label={`Choose a ${noun} from your contacts`}
        placeholder={`Choose a ${noun} from your contacts…`} value={q} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (!results.length) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setI((x) => (x + (e.key === "ArrowDown" ? 1 : results.length - 1)) % results.length); }
          else if (e.key === "Enter") { e.preventDefault(); choose(results[i]); }
          else if (e.key === "Escape") setOpen(false);
        }} />
      {open && (
        <ul id={`pp-${type}`} role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-misty bg-white p-1 shadow-xl">
          {results.map((p, k) => (
            <li key={p.id} role="option" aria-selected={k === i}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); choose(p); }} className={`w-full rounded-md px-2.5 py-1.5 text-left text-sm ${k === i ? "bg-accent-soft" : "hover:bg-sunken"}`}>
                <b>{p.name}</b>{p.company && p.company !== p.name ? <span className="muted"> · {p.company}</span> : null}{p.email ? <span className="block text-xs muted">{p.email}</span> : null}
              </button>
            </li>
          ))}
          {!results.length && <li className="px-2.5 py-1.5 text-sm muted">No {noun}s in your contacts{q ? ` matching "${q}"` : " yet"}. Type their info below and tick Save as contact.</li>}
        </ul>
      )}
    </div>
  );
}
