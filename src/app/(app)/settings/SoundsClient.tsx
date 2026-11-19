"use client";

import { useState, useTransition } from "react";
import { audioContext, playAlarm, playAlert, playRing } from "@/components/sounds";
import { SOUND_KINDS, SOUND_MAX, type SoundKind, type SoundPrefs } from "@/lib/sounds";
import { saveSounds } from "./actions";

const play = { alerts: playAlert, alarms: playAlarm, calls: playRing } as const;
const word = (n: number) => (n === 0 ? "Off" : `${n}%`);

/** Sound volumes with a Test button each; Save to keep them (they apply right away, on this and your other devices). */
export function SoundsClient({ initial, forId }: { initial: SoundPrefs; forId?: string }) {
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);
  const test = (k: SoundKind) => { const ctx = audioContext(); if (!ctx) { setError("This browser can't play sounds."); return; } setTimeout(() => play[k](ctx, v[k]), 60); };
  const save = () => start(async () => {
    setError("");
    const r = await saveSounds(v, forId);
    if (!r.ok) { setError(r.error); return; }
    setSaved(r.data!); setV(r.data!); if (!forId) { window.hqSounds = r.data!; window.dispatchEvent(new Event("hq-sounds")); } setMsg("Saved.");
  });
  return (
    <section className="card p-5" aria-labelledby="sounds-h">
      <h2 id="sounds-h" className="font-bold">Sounds</h2>
      <p className="mt-1 text-sm muted">How loud HQ&apos;s sounds are. 100% is the usual; drag to 0 to turn one off. HQ has to be open in a browser tab to make sounds, and your computer&apos;s volume still applies.</p>
      <ul className="mt-4 space-y-5">
        {SOUND_KINDS.map((k) => (
          <li key={k.key}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <label htmlFor={`snd-${k.key}`} className="font-semibold">{k.label}</label>
              <span className="text-sm font-semibold tabular-nums">{word(v[k.key])}</span>
            </div>
            <p className="text-xs muted">{k.hint}</p>
            <div className="mt-1.5 flex items-center gap-3">
              <input id={`snd-${k.key}`} type="range" min={0} max={SOUND_MAX} step={5} value={v[k.key]} className="w-full accent-[var(--color-accent,#5a6b45)]"
                onChange={(e) => { setMsg(""); setV({ ...v, [k.key]: Number(e.target.value) }); }} />
              <button type="button" className="btn whitespace-nowrap py-1 text-sm" disabled={v[k.key] === 0} onClick={() => test(k.key)}>▶ Test</button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}
      {msg && <p role="status" className="mt-3 text-sm text-accent">{msg}</p>}
      <div className="mt-4 flex justify-end gap-2 border-t border-misty pt-3">
        <button type="button" className="btn" disabled={!dirty || pending} onClick={() => { setV(saved); setMsg(""); }}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={!dirty || pending} onClick={save}>{pending ? "Saving…" : "Save"}</button>
      </div>
    </section>
  );
}
