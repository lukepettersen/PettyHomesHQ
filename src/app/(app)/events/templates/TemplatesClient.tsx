"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { TemplateView } from "@/server/events";
import { EVENT_MERGE_FIELDS, reminderWhen, type TemplateReminder } from "@/lib/events";
import { FieldsEditor, fromDraft, toDraft, type FieldDraft } from "../FieldsEditor";
import { TimeSelect } from "../TimeSelect";
import { removeEventTemplate, saveEventTemplate } from "../actions";

type Draft = { id: string | null; name: string; type: string; multiSlot: boolean; doneLabel: string; location: string; intro: string; waitlistLabel: string; offerText: string; fields: FieldDraft[]; reminders: TemplateReminder[] };
const blank: Draft = { id: null, name: "", type: "", multiSlot: false, doneLabel: "Order fulfilled", location: "", intro: "", waitlistLabel: "", offerText: "", fields: [], reminders: [] };
const toDraftT = (t: TemplateView): Draft => ({ id: t.id, name: t.name, type: t.type, multiSlot: t.multiSlot, doneLabel: t.doneLabel, location: t.location, intro: t.intro, waitlistLabel: t.waitlistLabel, offerText: t.offerText, fields: t.fields.map(toDraft), reminders: t.reminders });

export function TemplatesClient({ templates }: { templates: TemplateView[] }) {
  const router = useRouter();
  const [d, setD] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [sure, setSure] = useState("");
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    if (!d) return;
    setError("");
    const r = await saveEventTemplate({ ...d, fields: d.fields.map(fromDraft) });
    if (!r.ok) { setError(r.error); return; }
    setD(null); router.refresh();
  });
  const remove = (id: string) => start(async () => { const r = await removeEventTemplate(id); if (!r.ok) setError(r.error); setSure(""); router.refresh(); });

  if (d) return (
    <section className="card mt-4 p-5" aria-labelledby="tpl-h">
      <h2 id="tpl-h" className="font-bold">{d.id ? `Edit "${d.name}"` : "New template"}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="label">Name<input className="input mt-1" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Pi Day" /></label>
        <label className="label">Kind of event<input className="input mt-1" value={d.type} onChange={(e) => setD({ ...d, type: e.target.value })} placeholder="Client appreciation" /></label>
        <label className="label">Location<input className="input mt-1" value={d.location} onChange={(e) => setD({ ...d, location: e.target.value })} placeholder="Target Center, Minneapolis" /></label>
        <label className="label">&quot;Done&quot; is called<input className="input mt-1" value={d.doneLabel} onChange={(e) => setD({ ...d, doneLabel: e.target.value })} placeholder="Tickets sent / Order fulfilled" /></label>
      </div>
      <fieldset className="mt-3">
        <legend className="text-sm font-semibold">Dates</legend>
        <label className="mr-4 inline-flex items-center gap-1.5 text-sm"><input type="radio" checked={!d.multiSlot} onChange={() => setD({ ...d, multiSlot: false })} />One date (like Pi Day)</label>
        <label className="inline-flex items-center gap-1.5 text-sm"><input type="radio" checked={d.multiSlot} onChange={() => setD({ ...d, multiSlot: true })} />Many dates (like home games)</label>
      </fieldset>
      {d.multiSlot && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="label">Waitlist name (also a tag)<input className="input mt-1" value={d.waitlistLabel} onChange={(e) => setD({ ...d, waitlistLabel: e.target.value })} placeholder="Wants Wolves Tickets" /></label>
          <label className="label sm:col-span-2">Text offering a game to the waitlist<textarea className="input mt-1 w-full text-sm" rows={2} value={d.offerText} onChange={(e) => setD({ ...d, offerText: e.target.value })} placeholder="Hi {first_name}! I have tickets for Wolves vs {opponent} on {event_date}. Want them?" /></label>
        </div>
      )}
      <label className="label mt-3 block">Signup page intro<textarea className="input mt-1 w-full" rows={3} value={d.intro} onChange={(e) => setD({ ...d, intro: e.target.value })} placeholder="Shown at the top of the signup page" /></label>
      <h3 className="mt-4 font-semibold">Signup questions</h3>
      <p className="text-xs muted">Name, phone and email are always asked.</p>
      <div className="mt-2"><FieldsEditor fields={d.fields} onChange={(fields) => setD({ ...d, fields })} /></div>
      <h3 className="mt-4 font-semibold">Reminder texts</h3>
      <p className="text-xs muted">Copied to each new event, where they&apos;re scheduled for everyone confirmed. Merge fields: {"{first_name}"}, {EVENT_MERGE_FIELDS.map(([k]) => `{${k}}`).join(", ")}, and your questions&apos; fields.</p>
      <ul className="mt-2 space-y-2">
        {d.reminders.map((r, i) => {
          const set = (p: Partial<TemplateReminder>) => setD({ ...d, reminders: d.reminders.map((x, j) => (j === i ? { ...x, ...p } : x)) });
          return (
            <li key={i} className="rounded-lg border border-misty p-2">
              <div className="flex flex-wrap items-end gap-2">
                <label className="label min-w-[10rem] flex-1">Name<input className="input mt-1" value={r.name} onChange={(e) => set({ name: e.target.value })} /></label>
                <label className="label w-28">Days before<input type="number" min={0} max={60} className="input mt-1" value={r.daysBefore} onChange={(e) => set({ daysBefore: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })} /></label>
                <label className="label">At<TimeSelect value={r.time} onChange={(time) => set({ time })} blank={null} from="08:00" to="20:00" step={30} /></label>
                <button type="button" className="btn mb-0.5 px-2 py-1 text-xs text-bad" aria-label={`Remove reminder ${i + 1}`} onClick={() => setD({ ...d, reminders: d.reminders.filter((_, j) => j !== i) })}>✕</button>
              </div>
              <label className="label mt-2 block">Text<textarea className="input mt-1 w-full text-sm" rows={3} value={r.body} onChange={(e) => set({ body: e.target.value })} /></label>
              <p className="text-xs muted">{reminderWhen(r.daysBefore, r.time)}</p>
            </li>
          );
        })}
      </ul>
      <button type="button" className="btn mt-2 text-sm" onClick={() => setD({ ...d, reminders: [...d.reminders, { name: "Reminder", body: "Hi {first_name}! Reminder: {event_name} is {event_date} at {event_time}. Questions? Text Luke at 612-702-0295.", daysBefore: 1, time: "10:00" }] })}>+ Add reminder</button>
      {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}
      <div className="mt-4 flex justify-end gap-2 border-t border-misty pt-3">
        <button type="button" className="btn" onClick={() => { setD(null); setError(""); }}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save template"}</button>
      </div>
    </section>
  );
  return (
    <section className="card mt-4 overflow-hidden">
      <ul className="divide-y divide-misty">
        {templates.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <span className="min-w-0"><b>{t.name}</b><span className="block text-sm muted">{t.multiSlot ? "Many dates" : "One date"} · {t.fields.length} {t.fields.length === 1 ? "question" : "questions"} · {t.reminders.length} {t.reminders.length === 1 ? "reminder" : "reminders"} · used by {t.events} {t.events === 1 ? "event" : "events"}</span></span>
            <span className="flex gap-2">
              <button type="button" className="btn text-sm" onClick={() => { setD(toDraftT(t)); setError(""); }}>Edit</button>
              <button type="button" className="btn text-sm text-bad" onBlur={() => setSure("")} onClick={() => (sure === t.id ? remove(t.id) : setSure(t.id))}>{sure === t.id ? "Click again to remove" : "Remove"}</button>
            </span>
          </li>
        ))}
        {!templates.length && <li className="px-4 py-3 text-sm muted">No templates yet.</li>}
      </ul>
      {error && <p role="alert" className="px-4 pb-2 text-sm text-bad">{error}</p>}
      <div className="border-t border-misty px-4 py-3"><button type="button" className="btn btn-primary" onClick={() => setD(blank)}>+ New template</button></div>
    </section>
  );
}
