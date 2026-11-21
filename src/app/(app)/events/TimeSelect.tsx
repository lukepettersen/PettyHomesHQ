"use client";

import { formatTime } from "@/lib/tasks";

// 15-minute steps on a 12-hour clock (CLAUDE.md conventions); `from`/`to` narrow it (reminders: 8am–8pm, half hours).
const ALL = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);

export function TimeSelect({ value, onChange, blank = "No time", from = "00:00", to = "23:45", step = 15, label }: { value: string; onChange: (v: string) => void; blank?: string | null; from?: string; to?: string; step?: 15 | 30; label?: string }) {
  const times = ALL.filter((t) => t >= from && t <= to && Number(t.slice(3)) % step === 0);
  return (
    <select className="input mt-1" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {blank !== null && <option value="">{blank}</option>}
      {times.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
    </select>
  );
}
