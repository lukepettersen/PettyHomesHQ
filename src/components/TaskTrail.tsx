"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Contact opened from Tasks: ‹ Prev / Next › walk through the people in the list you came from
// (owner request 2026-10-20). Tasks saves that order on this device as you look at a list.
export const TRAIL_KEY = "hq-task-trail";
export type Trail = { list: string; ids: string[] };

export function saveTrail(t: Trail) {
  try { sessionStorage.setItem(TRAIL_KEY, JSON.stringify(t)); } catch { /* private window: no Prev/Next */ }
}

export function TaskTrail({ id }: { id: string }) {
  const [trail, setTrail] = useState<Trail | null>(null);
  useEffect(() => {
    let t: Trail | null = null;
    try { t = JSON.parse(sessionStorage.getItem(TRAIL_KEY) ?? "null"); } catch { /* ignore */ }
    const read = setTimeout(() => setTrail(t && Array.isArray(t.ids) ? t : null), 0);
    return () => clearTimeout(read);
  }, []);
  const at = trail ? trail.ids.indexOf(id) : -1;
  if (!trail || at < 0 || trail.ids.length < 2) return null;
  const href = (i: number) => (i >= 0 && i < trail.ids.length ? `/people/${trail.ids[i]}?from=tasks` : null);
  const prev = href(at - 1), next = href(at + 1);
  return (
    <nav aria-label="Step through your tasks" className="ml-auto flex items-center gap-2 text-sm">
      {prev ? <Link className="btn px-2.5 py-1" href={prev} rel="prev">‹ Prev</Link> : <span className="btn px-2.5 py-1 opacity-40">‹ Prev</span>}
      <span className="muted">{at + 1} of {trail.ids.length} in {trail.list}</span>
      {next ? <Link className="btn btn-primary px-2.5 py-1" href={next} rel="next">Next ›</Link> : <span className="btn px-2.5 py-1 opacity-40">Next ›</span>}
    </nav>
  );
}
