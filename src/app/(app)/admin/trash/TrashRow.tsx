"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteForever, restorePerson } from "./actions";

export function TrashRow({ id, name, left }: { id: string; name: string; left: number }) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); if (!r.ok) setError(r.error ?? "Error"); else router.refresh(); });
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-misty/60 px-4 py-3 last:border-0">
      <span className="font-semibold">{name}</span>
      <span className="text-sm muted">{left > 0 ? `${left} day${left === 1 ? "" : "s"} left` : "Removing today"}</span>
      <span className="ml-auto flex gap-2">
        <button type="button" className="btn" disabled={pending} onClick={() => run(() => restorePerson(id))}>Restore</button>
        <button type="button" className="btn btn-danger" disabled={pending} onBlur={() => setConfirm(false)} onClick={() => confirm ? run(() => deleteForever(id)) : setConfirm(true)}>{confirm ? "Click again to delete forever" : "Delete forever"}</button>
      </span>
      {error && <p role="alert" className="w-full text-sm text-bad">{error}</p>}
    </div>
  );
}
