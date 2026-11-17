"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveSalesSheet } from "./actions";

/** Owner only: the Google Sheet tab that gets a row when a deal goes under contract (owner request 2026-10-28). */
export function SalesSheetControls({ link, last, allowed }: { link: string; last: string; allowed: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(link);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const save = (v: string | null) => start(async () => { setError(""); const r = await saveSalesSheet(v); if (!r.ok) setError(r.error); else { if (v === null) setValue(""); router.refresh(); } });
  return (
    <div className="flex flex-col gap-2 rounded-md bg-sunken px-3 py-2 text-sm">
      <span><b>Sales sheet</b> (only you see this): when a deal goes under contract, HQ adds a row under the headers of this tab with what it knows. Close date and price follow changes; a deal that falls through has its row removed.</span>
      {!allowed && <span className="flex flex-wrap items-center gap-2 text-[#9a6400]">Google needs one more permission (Sheets). <a href="/api/google/connect" className="btn btn-primary">Reconnect Google</a></span>}
      <span className="flex flex-wrap gap-2">
        <input className="input min-w-[240px] flex-1" aria-label="Sales sheet link" placeholder="Paste the link to the tab (open it in Google Sheets, copy the address bar)" value={value} onChange={(e) => setValue(e.target.value)} />
        <button type="button" className="btn btn-primary" disabled={pending || !value.trim() || value === link} onClick={() => save(value)}>Save</button>
        {link && <button type="button" className="btn" disabled={pending} onClick={() => save(null)}>Turn off</button>}
      </span>
      {last && <span className="text-xs muted">Last: {last}</span>}
      {error && <span role="alert" className="text-bad">{error}</span>}
    </div>
  );
}
