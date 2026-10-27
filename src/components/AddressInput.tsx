"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * An address box that suggests full addresses as you type (Google, when connected in Admin → Integrations);
 * picking one fills in street, city, state and ZIP. You can always type your own.
 */
export function AddressInput({ value, onChange, placeholder = "Street, city", label }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string }) {
  const listId = useId();
  const [hits, setHits] = useState<{ id: string; text: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [problem, setProblem] = useState("");
  const [typed, setTyped] = useState(false); // only look up what the person typed, not what was loaded or picked
  const session = useRef("");
  useEffect(() => {
    if (!typed || value.trim().length < 3) return;
    if (!session.current) session.current = crypto.randomUUID();
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/address?q=${encodeURIComponent(value)}&s=${session.current}`, { signal: ctrl.signal }).then((r) => r.json())
        .then((d) => { setHits(d.results ?? []); setOpen((d.results ?? []).length > 0); setActive(0); setProblem(d.problem ?? ""); }).catch(() => {});
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [value, typed]);
  const pick = async (h: { id: string; text: string }) => {
    setOpen(false); setTyped(false); onChange(h.text);
    const d = await fetch(`/api/address/details?id=${encodeURIComponent(h.id)}&s=${session.current}`).then((r) => r.json()).catch(() => null);
    session.current = "";
    if (d?.address) onChange(d.address);
  };
  return (
    <div className="relative">
      <input className="input w-full" value={value} placeholder={placeholder} aria-label={label} autoComplete="off" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
        onChange={(e) => { setTyped(true); onChange(e.target.value); }} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !hits.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); void pick(hits[active]); }
          else if (e.key === "Escape") setOpen(false);
        }} />
      {problem && <p role="status" className="mt-1 text-xs text-bad">Address lookup: {problem}</p>}
      {open && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-misty bg-white py-1 shadow-xl">
          {hits.map((h, i) => (
            <li key={h.id} role="option" aria-selected={i === active}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); void pick(h); }} className={`block w-full px-3 py-1.5 text-left text-sm ${i === active ? "bg-accent-soft" : "hover:bg-sunken"}`}>{h.text}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
