"use client";

import { useState, useTransition } from "react";
import { SCHEDULE_TIMES } from "@/lib/scheduledText";
import { scheduleText } from "@/app/(app)/messages/actions";
import { scheduleEmail } from "@/app/(app)/people/emailActions";

const label = (t: string) => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`; };
/** Tomorrow in Central time, "YYYY-MM-DD". */
const tomorrow = () => new Date(Date.now() + 86400000).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
type Result = { ok: true; data?: { when: string } } | { ok: false; error: string };

/** Schedule button: a calendar date and a half-hour time (8:00am–8:00pm Central), then `save` stores it. */
function SchedulePicker({ what, ready, disabled, save, onScheduled }: {
  what: string; ready: boolean; disabled?: boolean; save: (date: string, time: string) => Promise<Result>; onScheduled: (when: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(tomorrow);
  const [time, setTime] = useState("09:00");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  if (!open) return <button type="button" className="btn" disabled={disabled} onClick={() => { setOpen(true); setError(""); }}>Schedule</button>;
  return (
    <span className="flex w-full flex-wrap items-center justify-end gap-2 rounded-lg border border-misty bg-sunken p-2">
      <span className="text-sm font-semibold">Send on</span>
      <input type="date" aria-label="Send on date" className="input w-auto" value={date} min={new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" })} onChange={(e) => setDate(e.target.value)} />
      <select aria-label="Send at time" className="input w-auto" value={time} onChange={(e) => setTime(e.target.value)}>
        {SCHEDULE_TIMES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
      </select>
      <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
      <button type="button" className="btn btn-primary" disabled={pending || disabled || !ready} onClick={() => start(async () => {
        setError("");
        const r = await save(date, time);
        if (!r.ok) { setError(r.error); return; }
        setOpen(false); onScheduled(r.data!.when);
      })}>{pending ? "Scheduling…" : `Schedule ${what}`}</button>
      {error && <span role="alert" className="w-full text-right text-sm text-bad">{error}</span>}
    </span>
  );
}

/**
 * Schedule (owner request 2026-10-28): next to every Send text. The text goes out from your number at the time
 * picked, even if HQ is closed.
 */
export function ScheduleText({ numbers, body, media, personId, taskId, disabled, onScheduled }: {
  numbers: string[]; body: string; media?: string[]; personId?: string | null; taskId?: string | null; disabled?: boolean; onScheduled: (when: string) => void;
}) {
  return <SchedulePicker what="text" ready={!!numbers.length && !!body.trim()} disabled={disabled} onScheduled={onScheduled}
    save={(date, time) => scheduleText({ numbers, body, media, personId: personId ?? null, taskId: taskId ?? null, date, time })} />;
}

/** Schedule next to Send email (owner request 2026-10-29): it goes out from your Gmail at the time picked. */
export function ScheduleEmail({ email, disabled, onScheduled }: {
  email: Omit<Parameters<typeof scheduleEmail>[0], "date" | "time">; disabled?: boolean; onScheduled: (when: string) => void;
}) {
  return <SchedulePicker what="email" ready={!!email.to.length && !!email.subject.trim() && !!email.body.trim()} disabled={disabled} onScheduled={onScheduled}
    save={(date, time) => scheduleEmail({ ...email, date, time })} />;
}
