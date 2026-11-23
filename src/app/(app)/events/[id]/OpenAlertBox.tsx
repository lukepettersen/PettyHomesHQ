"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { OpenAlert } from "@/lib/events";
import { formatTime } from "@/lib/tasks";
import { saveOpenAlertAction, testOpenAlertAction } from "../actions";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIMES = Array.from({ length: 64 }, (_, i) => { const m = 5 * 60 + i * 15; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; }); // 5:00am–8:45pm

/** Games tab: "Email us when a game has no one" (owner request 2026-11-23), with Save / Cancel and Send a test. */
export function OpenAlertBox({ eventId, saved, team }: { eventId: string; saved: OpenAlert; team: { id: string; name: string }[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState<OpenAlert>(saved);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const names = (ids: string[]) => team.filter((t) => ids.includes(t.id)).map((t) => t.name.split(" ")[0]).join(" & ") || "nobody yet";
  const when = (a: OpenAlert) => `${a.freq === "daily" ? "every day" : `every ${DAYS[a.day]}`} at ${formatTime(a.time)}`;
  const set = (p: Partial<OpenAlert>) => { setV({ ...v, ...p }); setMsg(""); };
  const save = () => start(async () => { setError(""); const r = await saveOpenAlertAction(eventId, v); if (!r.ok) { setError(r.error); return; } setEditing(false); router.refresh(); });
  const test = () => start(async () => { setError(""); setMsg(""); const r = await testOpenAlertAction(eventId, v); if (!r.ok) { setError(r.error); return; } setMsg(`Test sent to ${names(v.to)}${r.data!.games ? ` (${r.data!.games} open ${r.data!.games === 1 ? "game" : "games"})` : " (no open games right now)"}.`); });

  if (!editing) return (
    <div className="card mb-3 flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
      <span aria-hidden>🔔</span>
      <span className="min-w-0 flex-1">
        <b>Open-game email:</b>{" "}
        {saved.on ? <>on · {when(saved)}, {names(saved.to)} get{saved.to.length === 1 ? "s" : ""} an email listing games in the next {saved.days} days with no one going (only when there are some).</>
          : <span className="muted">off. Turn it on to get an email when a game coming up has no one going.</span>}
      </span>
      <button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => { setV(saved); setEditing(true); setMsg(""); setError(""); }}>{saved.on ? "Edit" : "Set up"}</button>
    </div>
  );
  return (
    <div className="card mb-3 flex flex-col gap-3 p-3 text-sm">
      <b>Open-game email</b>
      <label className="flex items-center gap-2"><input type="checkbox" checked={v.on} onChange={(e) => set({ on: e.target.checked })} /> Email when a game coming up has no one confirmed or sent</label>
      <div className="flex flex-wrap items-center gap-2">
        <span>Games in the next</span>
        <input type="number" min={1} max={60} className="input w-20 py-1" aria-label="Days ahead" value={v.days} onChange={(e) => set({ days: Math.min(60, Math.max(1, Number(e.target.value) || 1)) })} />
        <span>days</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span>Check</span>
        <select className="input w-auto py-1" aria-label="How often" value={v.freq === "daily" ? "daily" : String(v.day)} onChange={(e) => set(e.target.value === "daily" ? { freq: "daily" } : { freq: "weekly", day: Number(e.target.value) })}>
          <option value="daily">Every day</option>{DAYS.map((d, i) => <option key={d} value={i}>Every {d}</option>)}
        </select>
        <span>at</span>
        <select className="input w-auto py-1" aria-label="Time" value={v.time} onChange={(e) => set({ time: e.target.value })}>{TIMES.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}</select>
      </div>
      <fieldset className="flex flex-wrap items-center gap-3"><legend className="mb-1">Email goes to</legend>
        {team.map((t) => <label key={t.id} className="flex items-center gap-1.5"><input type="checkbox" checked={v.to.includes(t.id)} onChange={(e) => set({ to: e.target.checked ? [...v.to, t.id] : v.to.filter((x) => x !== t.id) })} />{t.name}</label>)}
      </fieldset>
      <p className="text-xs muted">It lists each game with no one confirmed or sent (and who it was offered to, if anyone). Nothing is sent when every game has someone.</p>
      {error && <p role="alert" className="text-bad">{error}</p>}
      {msg && <p role="status" className="text-accent">{msg}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" disabled={pending} onClick={save}>Save</button>
        <button type="button" className="btn" disabled={pending} onClick={() => { setEditing(false); setError(""); }}>Cancel</button>
        <button type="button" className="btn ml-auto" disabled={pending || !v.to.length} onClick={test}>Send a test now</button>
      </div>
    </div>
  );
}
