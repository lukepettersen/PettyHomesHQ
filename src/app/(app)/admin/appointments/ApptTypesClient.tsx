"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SaveBar } from "@/components/SaveBar";
import { BUILTIN_TYPES, type ApptTypeDef } from "@/lib/appointments";
import { saveApptTypes } from "./actions";

const LENGTHS = [15, 30, 45, 60, 90, 120, 180, 240];
const builtIn = (k: string) => BUILTIN_TYPES.some((b) => b.key === k);
const lengthLabel = (m: number) => (m < 60 ? `${m} min` : `${m / 60} hr${m === 60 ? "" : "s"}`).replace(".5 hrs", "½ hrs");

/** Rename / resize the built-ins; add, edit and remove your own (owner request 2026-10-27). */
export function ApptTypesClient({ types: initial }: { types: ApptTypeDef[] }) {
  const router = useRouter();
  const [types, setTypes] = useState(initial);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(types) !== JSON.stringify(initial);
  const patch = (k: string, x: Partial<ApptTypeDef>) => setTypes(types.map((t) => (t.key === k ? { ...t, ...x } : t)));
  const add = () => {
    const key = `c_${Math.random().toString(36).slice(2, 10)}`;
    const other = types.findIndex((t) => t.key === "other");
    setTypes([...types.slice(0, other), { key, label: "", mins: 60 }, ...types.slice(other)]);
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="card divide-y divide-misty">
        {types.map((t) => (
          <div key={t.key} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
            <input className="input min-w-[180px] flex-1" aria-label="Type name" placeholder="e.g. Listing Appointment" value={t.label} onChange={(e) => patch(t.key, { label: e.target.value })} autoFocus={!t.label} />
            <label className="flex items-center gap-1.5 text-sm">Length
              <select className="input w-auto" value={t.mins} onChange={(e) => patch(t.key, { mins: Number(e.target.value) })}>
                {LENGTHS.map((m) => <option key={m} value={m}>{lengthLabel(m)}</option>)}
              </select>
            </label>
            {builtIn(t.key)
              ? <span className="chip w-24 justify-center">Built in</span>
              : <button type="button" className="btn w-24 px-2 text-bad" aria-label={`Remove ${t.label || "type"}`} onClick={() => setTypes(types.filter((x) => x.key !== t.key))}>Remove</button>}
          </div>
        ))}
      </div>
      <button type="button" className="btn self-start" onClick={add}>+ Add type</button>
      <p className="text-xs muted">Removing a type doesn&apos;t change appointments already booked with it.</p>
      <SaveBar dirty={dirty} pending={pending} error={error} onDiscard={() => { setTypes(initial); setError(""); }}
        onSave={() => start(async () => { setError(""); const r = await saveApptTypes(types); if (!r.ok) setError(r.error); else router.refresh(); })} />
    </div>
  );
}
