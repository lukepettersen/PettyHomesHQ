"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { EventView } from "@/server/events";
import { FieldsEditor, fromDraft, toDraft, type FieldDraft } from "../FieldsEditor";
import { saveEventSignupPage } from "../actions";
import { SignupForm } from "@/app/join/[key]/SignupForm";
import { cleanFields } from "@/lib/events";

/** Edit the signup page's words and questions, with a live preview beside it (owner request 2026-11-22). */
export function SignupEditor({ e, today }: { e: EventView; today: string }) {
  const router = useRouter();
  const p = e.page;
  const start0 = { title: p.title, intro: p.intro, gamesOn: p.gamesOn || !e.multiSlot, gamesLabel: p.gamesLabel, thanks: p.thanks, emailRequired: p.emailRequired, fields: e.fields.map(toDraft) as FieldDraft[] };
  const [d, setD] = useState(start0);
  const [saved, setSaved] = useState(start0);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(d) !== JSON.stringify(saved);
  const set = (x: Partial<typeof d>) => { setMsg(""); setD({ ...d, ...x }); };
  const save = () => start(async () => {
    setError("");
    const r = await saveEventSignupPage(e.id, { ...d, fields: d.fields.map(fromDraft) });
    if (!r.ok) { setError(r.error); return; }
    setSaved(d); setMsg("Saved. The page shows this now."); router.refresh();
  });
  const box = "input mt-1 w-full";
  const upcoming = e.slots.filter((s) => s.date >= today);
  return (
    <section className="card p-4" aria-labelledby="spe-h">
      <h2 id="spe-h" className="text-lg font-bold">Page wording &amp; questions</h2>
      <p className="text-sm muted">Leave a box blank to use the wording shown in gray. The preview on the right updates as you type.</p>
      <div className="mt-3 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-3">
          <label className="label">Headline<input className={box} value={d.title} placeholder={p.defaults.title} onChange={(x) => set({ title: x.target.value })} /></label>
          <label className="label">Intro<textarea className={box} rows={3} value={d.intro} placeholder="A line or two at the top of the page" onChange={(x) => set({ intro: x.target.value })} /></label>
          {e.multiSlot && (
            <div className="rounded-lg border border-misty p-3">
              <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={d.gamesOn} onChange={(x) => set({ gamesOn: x.target.checked })} />Let them pick games they&apos;d like</label>
              {d.gamesOn && <label className="label mt-2 block">Question above the games<input className={box} value={d.gamesLabel} placeholder={p.defaults.gamesLabel} onChange={(x) => set({ gamesLabel: x.target.value })} /></label>}
              <p className="mt-1 text-xs muted">Only games still ahead are listed.</p>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={d.emailRequired} onChange={(x) => set({ emailRequired: x.target.checked })} />Email is required (name and cell phone always are)</label>
          <div>
            <h3 className="font-semibold">Questions</h3>
            <div className="mt-1"><FieldsEditor fields={d.fields} onChange={(fields) => set({ fields })} /></div>
          </div>
          <label className="label">Thank-you message<textarea className={box} rows={2} value={d.thanks} placeholder={p.defaults.thanks} onChange={(x) => set({ thanks: x.target.value })} />
            <span className="mt-1 block text-xs font-normal muted">{"{first}"} is their first name, {"{event}"} the event&apos;s name.</span></label>
          {error && <p role="alert" className="text-sm text-bad">{error}</p>}
          {msg && <p role="status" className="text-sm text-accent">{msg}</p>}
          <div className="flex justify-end gap-2 border-t border-misty pt-3">
            <button type="button" className="btn" disabled={!dirty || pending} onClick={() => { setD(saved); setMsg(""); setError(""); }}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={!dirty || pending} onClick={save}>{pending ? "Saving…" : "Save"}</button>
          </div>
        </div>
        <div className="lg:sticky lg:top-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide muted">Preview{dirty ? " (not saved yet)" : ""}</p>
          <div className="max-h-[80vh] overflow-auto rounded-2xl border-4 border-charcoal/80 bg-paper px-3 py-5">
            <p className="text-center text-xs font-bold tracking-wide text-accent">PETTY HOMES</p>
            <h3 className="mt-1 text-center text-xl font-extrabold">{d.title || p.defaults.title}</h3>
            {d.intro && <p className="mt-2 whitespace-pre-wrap text-center text-sm">{d.intro}</p>}
            <SignupForm key={JSON.stringify(d.fields)} preview signupKey="preview" multiSlot={e.multiSlot} eventName={e.name}
              fields={cleanFields(d.fields.map(fromDraft))} slots={upcoming.slice(0, 6).map((s) => ({ id: s.id, date: s.date, time: s.time, title: s.title, opponent: s.opponent, location: s.location }))}
              page={{ gamesOn: e.multiSlot && d.gamesOn, gamesLabel: d.gamesLabel || p.defaults.gamesLabel, thanks: d.thanks || p.defaults.thanks, emailRequired: d.emailRequired }} />
            {upcoming.length > 6 && e.multiSlot && d.gamesOn && <p className="mt-1 text-center text-xs muted">…and {upcoming.length - 6} more games</p>}
            <p className="mt-4 text-center text-xs muted">Questions? Text Luke at 612-702-0295.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
