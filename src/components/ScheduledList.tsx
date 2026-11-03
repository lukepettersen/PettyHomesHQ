"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelScheduledText } from "@/app/(app)/messages/actions";
import { cancelScheduledEmail } from "@/app/(app)/people/emailActions";

export type ScheduledRow = { id: string; when: string; to: string; body: string; by: string; mine: boolean; status: string; error: string | null; personId?: string | null; personName?: string | null; auto?: boolean; email?: boolean };

/** Texts and emails scheduled for this person that haven't gone out (or didn't send), and checklist steps that send by
 *  themselves, with Cancel / Turn off (owner requests 2026-10-28, 10-29). */
export function ScheduledList({ rows, withPerson = false, empty }: { rows: ScheduledRow[]; withPerson?: boolean; empty?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, start] = useTransition();
  const [full, setFull] = useState<string[]>([]); // texts opened to read in full (owner request 2026-10-28)
  if (!rows.length) return empty ? <p className="card px-4 py-3 text-sm muted">{empty}</p> : null;
  return (
    <section aria-label="Scheduled" className="card mb-3 px-4 py-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider muted">{rows.some((x) => x.auto || x.email) ? "Scheduled texts & emails" : "Scheduled texts"}</h3>
      <ul className="mt-1 flex flex-col">
        {rows.map((x) => (
          <li key={x.id} className="flex flex-wrap items-start justify-between gap-2 border-t border-misty/60 py-1.5 text-sm first:border-0">
            <span className="min-w-0 flex-1">
              <b>{x.status === "failed" ? "Not sent" : x.when}</b>{withPerson && x.personId && x.personName && <> · <Link href={`/people/${x.personId}`} className="font-semibold text-accent hover:underline">{x.personName}</Link></>} <span className="muted">to {x.to} · by {x.by}</span>
              <button type="button" aria-expanded={full.includes(x.id)} title={full.includes(x.id) ? "Show less" : "Show the whole text"} onClick={() => setFull(full.includes(x.id) ? full.filter((y) => y !== x.id) : [...full, x.id])}
                className={`block w-full text-left hover:text-accent ${full.includes(x.id) ? "whitespace-pre-wrap break-words" : "truncate"}`}>{x.body}</button>
              {x.error && <span className="block text-xs text-bad">{x.when}: {x.error}</span>}
            </span>
            {x.status === "pending" && x.mine && <button type="button" className="text-xs font-semibold text-bad hover:underline" disabled={busy}
              onClick={() => start(async () => { setError(""); const r = x.id.startsWith("email:") ? await cancelScheduledEmail(x.id.slice(6)) : await cancelScheduledText(x.id); if (!r.ok) setError(r.error); else router.refresh(); })}>{x.auto ? "Turn off" : "Cancel"}</button>}
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    </section>
  );
}
