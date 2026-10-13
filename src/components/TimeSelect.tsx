"use client";

/** Times every 15 minutes, "00:00" … "23:45". */
export const TIMES = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);
const label = (t: string) => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`; };

/** A time picker in 15-minute steps. */
export function TimeSelect({ value, onChange, label: aria, allowNone, className = "input" }: { value: string; onChange: (v: string) => void; label: string; allowNone?: boolean; className?: string }) {
  const opts = value && !TIMES.includes(value) ? [...TIMES, value].sort() : TIMES;
  return (
    <select aria-label={aria} className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      {(allowNone || !value) && <option value="">{allowNone ? "No time" : "—"}</option>}
      {opts.map((t) => <option key={t} value={t}>{label(t)}</option>)}
    </select>
  );
}

/** Date plus a 15-minute time; picking a date starts the time at 12:00pm. Value is "YYYY-MM-DDTHH:MM" or "". */
export function DateTimeInput({ value, onChange, label: aria }: { value: string; onChange: (v: string) => void; label: string }) {
  const [d, t] = value ? value.split("T") : ["", ""];
  return (
    <span className="flex gap-2">
      <input aria-label={aria} type="date" className="input" value={d} onChange={(e) => onChange(e.target.value ? `${e.target.value}T${t || "12:00"}` : "")} />
      <TimeSelect label={`${aria} time`} value={d ? t || "12:00" : ""} onChange={(x) => d && onChange(`${d}T${x}`)} className="input w-auto" />
    </span>
  );
}
