"use client";

import { useState } from "react";
import { moneyTyped } from "@/lib/files";

/** "Money or %" box: a $ / % switch beside it. Saved as "5000" (dollars) or "3%" (owner request 2026-10-26). */
export function MoneyOrPctInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [unit, setUnit] = useState<"$" | "%">(value.trim().endsWith("%") ? "%" : "$");
  const num = value.replace(/[^\d.]/g, "");
  const [focus, setFocus] = useState(false);
  // In % mode it reads "2%" once you leave the box (the % isn't added while typing, so backspace still works).
  const shown = unit === "$" ? moneyTyped(value) : focus || !num ? num : `${num}%`;
  const set = (raw: string, u = unit) => {
    if (u === "$") return onChange(moneyTyped(raw));
    const n = raw.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
    onChange(n ? `${n}%` : "");
  };
  const pick = (u: "$" | "%") => { setUnit(u); set(u === "$" ? num.split(".")[0] : num, u); };
  return (
    <span className="flex gap-1.5">
      <input aria-label={label} className="input min-w-0 flex-1" inputMode="decimal" value={shown} placeholder={unit === "$" ? "$" : "e.g. 3"} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} onChange={(e) => set(e.target.value)} />
      <span role="group" aria-label={`${label}: dollars or percent`} className="flex overflow-hidden rounded-md border border-misty">
        {(["$", "%"] as const).map((u) => (
          <button key={u} type="button" aria-pressed={unit === u} onClick={() => pick(u)} className={`px-3 text-sm font-semibold ${unit === u ? "bg-accent text-white" : "bg-white hover:bg-sunken"}`}>{u}</button>
        ))}
      </span>
    </span>
  );
}
