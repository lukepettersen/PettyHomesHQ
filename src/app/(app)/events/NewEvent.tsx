"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { TimeSelect } from "./TimeSelect";
import { newEvent } from "./actions";

/** "New event": from a template (its questions and reminders copied, so you just set the date) or blank. */
export function NewEvent({ templates, today }: { templates: { id: string; name: string; multiSlot: boolean }[]; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const t = templates.find((x) => x.id === templateId) ?? null;
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const pick = (tid: string) => { setTemplateId(tid); const n = templates.find((x) => x.id === tid)?.name; setName(n ? `${n} ${today.slice(0, 4)}` : ""); };
  const create = () => start(async () => {
    setError("");
    const r = await newEvent({ templateId: templateId || null, name, date: t?.multiSlot ? null : date || null, time: t?.multiSlot ? null : time || null });
    if (!r.ok) { setError(r.error); return; }
    router.push(`/events/${r.data}`);
  });
  if (!open) return <div className="mt-3"><button type="button" className="btn btn-primary" onClick={() => { setOpen(true); pick(templateId); }}>+ New event</button></div>;
  return (
    <section className="card mt-3 p-4" aria-labelledby="new-h">
      <h2 id="new-h" className="font-bold">New event</h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <label className="label">From template
          <select className="input mt-1" value={templateId} onChange={(e) => pick(e.target.value)}>
            {templates.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            <option value="">Blank event (no template)</option>
          </select>
        </label>
        <label className="label">Event name<input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Pi Day 2027" /></label>
        {!t?.multiSlot && <>
          <label className="label">Date<input type="date" className="input mt-1" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="label">Time (optional)<TimeSelect value={time} onChange={setTime} /></label>
        </>}
      </div>
      {t?.multiSlot && <p className="mt-2 text-sm muted">This one has many dates (like games): add them on the next page, or import the schedule.</p>}
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={create}>{pending ? "Creating…" : "Create event"}</button>
      </div>
    </section>
  );
}
