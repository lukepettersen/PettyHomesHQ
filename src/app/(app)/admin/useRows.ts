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
    // `extra`: a row typed into an "add" box but not added yet, saved too (owner report 2026-11-01).
    save: (extra?: T[] | unknown, onSaved?: () => void) => start(async () => { setError(""); const all = [...rows, ...(Array.isArray(extra) ? (extra as T[]) : [])]; const r = await save(all); if (!r.ok) setError(r.error); else { setRows(all); onSaved?.(); router.refresh(); } }),
  };
}
