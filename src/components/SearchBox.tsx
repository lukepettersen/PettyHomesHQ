"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Result = { id: string; name: string; detail: string; stage: string };

// The last 5 contacts opened on this device (search or contact page), shown when the search box is clicked.
const RECENT_KEY = "hq-recent-people";
function loadRecent(): Result[] { try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; } }
function addRecent(r: Result) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([r, ...loadRecent().filter((x) => x.id !== r.id)].slice(0, 5))); } catch { /* private window */ }
}

/** Put on a contact page so it shows under "Recent" in the search box. */
export function RememberRecent({ id, name, detail = "", stage = "" }: { id: string; name: string; detail?: string; stage?: string }) {
  useEffect(() => { addRecent({ id, name, detail, stage }); }, [id, name, detail, stage]);
  return null;
}

/** Top-bar search: results drop down as you type (name, phone or email). Enter opens the highlighted person. */
export function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<Result[]>([]);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal, cache: "no-store" });
        if (r.ok) { setResults((await r.json()).results); setActive(0); setOpen(true); }
      } catch { /* typing again cancels the previous search */ }
    }, 150);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const go = (r?: Result) => {
    setOpen(false);
    if (r) { addRecent(r); setQ(""); setResults([]); router.push(`/people/${r.id}`); }
    else if (q.trim()) router.push(`/people?q=${encodeURIComponent(q.trim())}`);
  };
  const searching = q.trim().length >= 2;
  const shown = searching ? results : recent;

  return (
    <div ref={box} className="relative ml-auto hidden md:block" role="search">
      <input type="search" value={q} placeholder="Search people…" aria-label="Search people" role="combobox" aria-expanded={open && shown.length > 0} aria-controls="search-results" aria-autocomplete="list"
        onChange={(e) => { setQ(e.target.value); if (e.target.value.trim().length < 2) { setRecent(loadRecent()); setActive(0); } }}
        onFocus={() => { setRecent(loadRecent()); setActive(0); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, shown.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); go(open ? shown[active] : undefined); }
          else if (e.key === "Escape") setOpen(false);
        }}
        className="w-56 rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white placeholder:text-misty/70 outline-none focus:bg-white focus:text-charcoal lg:w-72" />
      {open && !searching && recent.length > 0 && <p className="absolute right-0 top-full z-50 mt-1 w-80 rounded-t-lg border border-b-0 border-misty bg-white px-3 pt-2 text-xs font-semibold uppercase tracking-wide muted">Recent</p>}
      {open && (searching || recent.length > 0) && (
        <ul id="search-results" role="listbox" aria-label={searching ? "Matching people" : "Recent contacts"} className={`absolute right-0 z-50 w-80 overflow-hidden border border-misty bg-white text-charcoal shadow-xl ${searching ? "top-full mt-1 rounded-lg" : "top-[calc(100%+1.75rem)] rounded-b-lg border-t-0"}`}>
          {shown.map((r, i) => (
            <li key={r.id} role="option" aria-selected={i === active}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => go(r)} onMouseEnter={() => setActive(i)}
                className={`flex w-full flex-col px-3 py-2 text-left text-sm ${i === active ? "bg-accent-soft" : ""}`}>
                <span className="font-semibold">{r.name}</span>
                <span className="text-xs muted">{[r.detail, r.stage].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
          {searching && shown.length === 0 && <li className="px-3 py-2 text-sm muted">No one matches &quot;{q.trim()}&quot;.</li>}
          {searching && shown.length > 0 && <li><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => go()} className="w-full border-t border-misty px-3 py-2 text-left text-xs font-semibold text-accent">See all results on People</button></li>}
        </ul>
      )}
    </div>
  );
}
