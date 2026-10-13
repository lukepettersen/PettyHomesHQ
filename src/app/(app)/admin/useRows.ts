"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Result = { ok: true } | { ok: false; error: string };

/** Shared state for Admin tables: edit rows, reorder, add, remove, then Save changes / Discard. */
export function useRows<T>(initial: T[], save: (rows: T[]) => Promise<Result>) {
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return {
    rows, error, pending,
    dirty: JSON.stringify(rows) !== JSON.stringify(initial),
    patch: (i: number, p: Partial<T>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x))),
    move: (i: number, d: number) => setRows((r) => { const n = [...r]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; }),
    remove: (i: number) => setRows((r) => r.filter((_, j) => j !== i)),
    add: (row: T) => setRows((r) => [...r, row]),
    discard: () => { setRows(initial); setError(""); },
    save: () => start(async () => { setError(""); const r = await save(rows); if (!r.ok) setError(r.error); else router.refresh(); }),
  };
}
