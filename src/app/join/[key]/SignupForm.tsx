"use client";

import { useState, useTransition } from "react";
import type { EventField } from "@/lib/events";
import { longEventDate } from "@/lib/events";
import { formatTime } from "@/lib/tasks";
import { submitSignup } from "./actions";

type Slot = { id: string; date: string; time: string | null; title: string; opponent: string; location: string };

export function SignupForm({ signupKey, multiSlot, fields, slots, eventName }: { signupKey: string; multiSlot: boolean; fields: EventField[]; slots: Slot[]; eventName: string }) {
  const [v, setV] = useState({ first: "", last: "", phone: "", email: "", website: "" });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const send = (x: React.FormEvent) => { x.preventDefault(); start(async () => {
    setError("");
    const r = await submitSignup({ key: signupKey, ...v, slotIds: picked, answers });
    if (!r.ok) { setError(r.error); return; }
    setDone(true);
  }); };
  if (done) return <p className="card mt-6 p-5 text-center text-lg">Thanks, {v.first}! You&apos;re signed up for {eventName}{multiSlot ? `. We'll be in touch about ${picked.length === 1 ? "the game" : "the games"} you picked` : ""}.</p>;
  const box = "input mt-1 w-full";
  return (
    <form onSubmit={send} className="card mt-6 flex flex-col gap-3 p-5">
      <div className="grid grid-cols-2 gap-3">
        <label className="label">First name<input className={box} required autoComplete="given-name" value={v.first} onChange={(x) => setV({ ...v, first: x.target.value })} /></label>
        <label className="label">Last name<input className={box} autoComplete="family-name" value={v.last} onChange={(x) => setV({ ...v, last: x.target.value })} /></label>
      </div>
      <label className="label">Cell phone<input className={box} required type="tel" autoComplete="tel" inputMode="tel" value={v.phone} onChange={(x) => setV({ ...v, phone: x.target.value })} /></label>
      <label className="label">Email<input className={box} type="email" autoComplete="email" value={v.email} onChange={(x) => setV({ ...v, email: x.target.value })} /></label>
      {/* Robots fill in every box; people never see this one. */}
      <label className="absolute -left-[9999px]" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={v.website} onChange={(x) => setV({ ...v, website: x.target.value })} /></label>
      {multiSlot && (
        <fieldset>
          <legend className="text-sm font-semibold">Which {slots.length === 1 ? "date" : "dates"} would you like?</legend>
          {!slots.length && <p className="text-sm muted">No dates are open right now.</p>}
          <div className="mt-1 flex max-h-80 flex-col gap-1 overflow-auto">
            {slots.map((s) => (
              <label key={s.id} className="flex items-start gap-2 rounded-lg border border-misty px-3 py-2 text-sm">
                <input type="checkbox" className="mt-0.5" checked={picked.includes(s.id)} onChange={(x) => setPicked(x.target.checked ? [...picked, s.id] : picked.filter((p) => p !== s.id))} />
                <span><b>{s.title || eventName}</b><span className="block muted">{longEventDate(s.date)}{s.time ? ` · ${formatTime(s.time)}` : ""}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {fields.map((f) => (
        <label key={f.key} className="label">{f.label}{f.required ? "" : <span className="font-normal muted"> (optional)</span>}
          {f.type === "select" ? <select className={box} required={f.required} value={answers[f.key] ?? ""} onChange={(x) => setAnswers({ ...answers, [f.key]: x.target.value })}><option value="">Choose…</option>{f.options.map((o) => <option key={o}>{o}</option>)}</select>
            : f.type === "long" ? <textarea className={box} rows={3} required={f.required} value={answers[f.key] ?? ""} onChange={(x) => setAnswers({ ...answers, [f.key]: x.target.value })} />
            : <input className={box} required={f.required} type={f.type === "number" ? "number" : "text"} min={f.type === "number" ? 0 : undefined} max={f.type === "number" ? 9999 : undefined} value={answers[f.key] ?? ""} onChange={(x) => setAnswers({ ...answers, [f.key]: x.target.value })} />}
        </label>
      ))}
      <p className="text-xs muted">By signing up you agree to get texts from Petty Homes about this event. Reply STOP anytime to opt out.</p>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Sending…" : "Sign up"}</button>
    </form>
  );
}
