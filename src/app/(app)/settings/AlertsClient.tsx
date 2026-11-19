"use client";

import { useState, useTransition } from "react";
import { ALERT_KINDS, type AlertPrefs } from "@/lib/alerts";
import { saveAlerts } from "./actions";

/** My settings → Pop-up alerts (owner request 2026-11-19): which things pop up in the corner with a chime. The bell
 *  keeps everything either way. Save to keep them. */
export function AlertsClient({ initial }: { initial: AlertPrefs }) {
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const dirty = ALERT_KINDS.some((k) => v[k.key] !== saved[k.key]);
  const save = () => start(async () => {
    setError("");
    const r = await saveAlerts(Object.fromEntries(ALERT_KINDS.map((k) => [k.key, v[k.key]])));
    if (!r.ok) { setError(r.error); return; }
    setSaved(r.data!); setV(r.data!); window.hqAlerts = r.data!; setMsg("Saved.");
  });
  return (
    <section className="card mt-4 p-5" aria-labelledby="alerts-h">
      <h2 id="alerts-h" className="font-bold">Pop-up alerts</h2>
      <p className="mt-1 text-sm muted">What pops up in the corner with a chime (and a computer notification when HQ is in a background tab). Everything still goes in the bell 🔔 either way.</p>
      <ul className="mt-3 divide-y divide-misty">
        {ALERT_KINDS.map((k) => (
          <li key={k.key}>
            <label className="flex cursor-pointer items-center justify-between gap-3 py-2.5">
              <span><span className="font-semibold">{k.label}</span><span className="block text-xs muted">{k.hint}</span></span>
              <input type="checkbox" className="h-5 w-5 shrink-0" checked={v[k.key]} onChange={(e) => { setMsg(""); setV({ ...v, [k.key]: e.target.checked }); }} />
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs muted">Task alarms and incoming calls always ring; set how loud above. For any sound, HQ has to be open in a browser tab and you need to have clicked on the page once since opening it.</p>
      {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}
      {msg && <p role="status" className="mt-3 text-sm text-accent">{msg}</p>}
      <div className="mt-4 flex justify-end gap-2 border-t border-misty pt-3">
        <button type="button" className="btn" disabled={!dirty || pending} onClick={() => { setV(saved); setMsg(""); }}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={!dirty || pending} onClick={save}>{pending ? "Saving…" : "Save"}</button>
      </div>
    </section>
  );
}
