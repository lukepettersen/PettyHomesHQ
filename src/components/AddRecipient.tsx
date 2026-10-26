"use client";

import { useEffect, useState } from "react";
import { formatPhone, normalizePhone } from "@/lib/normalize";

export type Extra = { value: string; label: string; personId: string | null };
type Hit = { id: string; name: string; phones: string[]; emails: string[] };

/** "+ Add": search a contact (pick one of their emails or numbers) or type an address / number yourself. */
export function AddRecipient({ mode, onAdd, exclude = [] }: { mode: "email" | "phone"; onAdd: (x: Extra) => void; exclude?: string[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  useEffect(() => {
    if (!open || q.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => { fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal }).then((r) => r.json()).then((d) => setHits(d.results ?? [])).catch(() => {}); }, 200);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [open, q]);
  const typed = mode === "email" ? (/^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(q.trim()) ? q.trim().toLowerCase() : null) : (normalizePhone(q).length === 10 && /^[\d\s()+.-]+$/.test(q.trim()) ? normalizePhone(q) : null);
  const add = (x: Extra) => { onAdd(x); setQ(""); setHits([]); setOpen(false); };
  if (!open) return <button type="button" className="text-sm font-semibold text-accent hover:underline" onClick={() => setOpen(true)}>+ Add</button>;
  return (
    <div className="relative flex w-full flex-col gap-1 sm:w-80">
      <span className="flex gap-1.5">
        <input autoFocus className="input" aria-label={mode === "email" ? "Add an email or contact" : "Add a number or contact"} value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={mode === "email" ? "Name or email address" : "Name or phone number"}
          onKeyDown={(e) => { if (e.key === "Enter" && typed) { e.preventDefault(); add({ value: typed, label: mode === "phone" ? formatPhone(typed) : typed, personId: null }); } if (e.key === "Escape") setOpen(false); }} />
        <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
      </span>
      {typed && !exclude.includes(typed) && <button type="button" className="self-start rounded-md px-2 py-1 text-left text-sm hover:bg-sunken" onClick={() => add({ value: typed, label: mode === "phone" ? formatPhone(typed) : typed, personId: null })}>Add <b>{mode === "phone" ? formatPhone(typed) : typed}</b></button>}
      {q.trim().length >= 2 && hits.map((h) => {
        const opts = (mode === "email" ? h.emails.map((e) => e.toLowerCase()) : h.phones).filter((o) => !exclude.includes(o));
        return (
          <div key={h.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-0.5 text-sm">
            <b>{h.name}</b>
            {opts.length ? opts.map((o) => <button key={o} type="button" className="rounded-full border border-misty bg-white px-2 py-0.5 text-xs font-semibold hover:border-accent" onClick={() => add({ value: o, label: `${h.name} · ${mode === "phone" ? formatPhone(o) : o}`, personId: h.id })}>{mode === "phone" ? formatPhone(o) : o}</button>)
              : <span className="text-xs muted">No {mode === "email" ? "email" : "phone number"} on file</span>}
          </div>
        );
      })}
    </div>
  );
}

export function ExtraChips({ extras, onRemove }: { extras: Extra[]; onRemove: (value: string) => void }) {
  return <>{extras.map((x) => (
    <span key={x.value} className="flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-sm font-semibold text-accent">
      {x.label}<button type="button" aria-label={`Remove ${x.label}`} className="px-0.5 hover:text-bad" onClick={() => onRemove(x.value)}>×</button>
    </span>
  ))}</>;
}

/** Quick add from the deal: a checkbox per role (title, lender, agents…); greyed out when the contract has no email for it. */
export function PartyChecks({ parties, chosen, onToggle }: { parties: Extra[]; chosen: string[]; onToggle: (x: Extra, on: boolean) => void }) {
  if (!parties.length) return null;
  return (
    <fieldset className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <legend className="sr-only">Also send to</legend>
      <span className="text-xs font-semibold muted">Also send to:</span>
      {parties.map((x, i) => (
        <label key={x.value || `none${i}`} title={x.value || "No email for them on the purchase agreement"} className={`flex items-center gap-1 ${x.value ? "" : "muted"}`}>
          <input type="checkbox" disabled={!x.value} checked={!!x.value && chosen.includes(x.value)} onChange={(e) => onToggle(x, e.target.checked)} />
          {x.label}{x.value ? "" : " (no email)"}
        </label>
      ))}
    </fieldset>
  );
}
