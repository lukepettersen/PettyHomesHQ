"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { completeTask } from "@/app/(app)/tasks/actions";

type Alarm = { id: string; title: string; time: string; kind: string; personId: string | null; personName: string | null };

// Task alarms (SPEC.md §9): when a task with a set time comes due, the person it's assigned to gets a pop-up
// with a repeating chime (and a desktop notification if allowed). HQ must be open in a browser tab.
const nowCentral = () => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
const minutes = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const clock = (t: string) => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`; };
const LATE_WINDOW = 180; // still ring for tasks that came due up to 3 hours ago (e.g. the computer was asleep)

function load(key: string): Record<string, number> { try { return JSON.parse(localStorage.getItem(key) ?? "{}"); } catch { return {}; } }
function save(key: string, v: Record<string, number>) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private window */ } }
/** Remembers an alarm until a time (ms): handled = forever (today), snoozed = 5 minutes. */
function mark(store: "hq-alarms-done" | "hq-alarms-snooze", key: string, forMs = 0) { const v = load(store); v[key] = Date.now() + forMs; save(store, v); }
const permission = (): NotificationPermission | "unsupported" => (typeof Notification === "undefined" ? "unsupported" : Notification.permission);

export function AlarmCenter() {
  const router = useRouter();
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [date, setDate] = useState("");
  const [ringing, setRinging] = useState<Alarm[]>([]);
  const [canNotify, setCanNotify] = useState<NotificationPermission | "unsupported">("unsupported");
  useEffect(() => { const t = setTimeout(() => setCanNotify(permission()), 0); return () => clearTimeout(t); }, []);
  const audio = useRef<AudioContext | null>(null);
  const notified = useRef(new Set<string>());
  // An alarm is "handled" per task, date and time, so moving a task to a new time rings again.
  const keyOf = useCallback((a: Alarm) => `${a.id}@${date}T${a.time}`, [date]);

  const fetchAlarms = useCallback(async () => {
    try {
      const r = await fetch("/api/alarms", { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as { date: string; alarms: Alarm[] };
      setDate(j.date); setAlarms(j.alarms);
    } catch { /* offline: try again later */ }
  }, []);

  useEffect(() => {
    // Browsers only allow sound after the person has clicked or typed on the page once.
    const unlock = () => { if (!audio.current) { try { audio.current = new AudioContext(); } catch { /* no audio */ } } else void audio.current.resume(); };
    window.addEventListener("pointerdown", unlock); window.addEventListener("keydown", unlock);
    const kick = setTimeout(fetchAlarms, 0);
    const poll = setInterval(fetchAlarms, 60000);
    window.addEventListener("focus", fetchAlarms);
    return () => { clearTimeout(kick); clearInterval(poll); window.removeEventListener("focus", fetchAlarms); window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, [fetchAlarms]);

  // Every 15 seconds: anything due now (or in the last 3 hours) that hasn't been handled or snoozed rings.
  useEffect(() => {
    const check = () => {
      const now = minutes(nowCentral()), handled = load("hq-alarms-done"), snoozed = load("hq-alarms-snooze");
      const due = alarms.filter((a) => {
        const k = keyOf(a), at = minutes(a.time);
        return at <= now && now - at <= LATE_WINDOW && !handled[k] && !((snoozed[k] ?? 0) > Date.now());
      });
      setRinging((cur) => (JSON.stringify(cur.map((a) => a.id)) === JSON.stringify(due.map((a) => a.id)) ? cur : due));
      for (const a of due) {
        const k = keyOf(a);
        if (notified.current.has(k) || typeof Notification === "undefined" || Notification.permission !== "granted") continue;
        notified.current.add(k);
        const n = new Notification(`⏰ ${a.title}`, { body: `Due ${clock(a.time)}${a.personName ? ` · ${a.personName}` : ""}`, requireInteraction: true, tag: k });
        n.onclick = () => { window.focus(); n.close(); };
      }
    };
    check();
    const t = setInterval(check, 15000);
    return () => clearInterval(t);
  }, [alarms, keyOf]);

  // While something is ringing: a chime every 2 seconds and a flashing tab title.
  useEffect(() => {
    if (!ringing.length) return;
    const original = document.title;
    let flip = false;
    const chime = () => {
      const ctx = audio.current;
      if (ctx && ctx.state === "running") {
        [0, 0.18, 0.36].forEach((offset, i) => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = "sine"; o.frequency.value = i === 2 ? 1320 : 880;
          g.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
          g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + offset + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.16);
          o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + offset); o.stop(ctx.currentTime + offset + 0.17);
        });
      }
      flip = !flip; document.title = flip ? `⏰ ${ringing[0].title}` : original;
    };
    chime();
    const t = setInterval(chime, 2000);
    return () => { clearInterval(t); document.title = original; };
  }, [ringing]);

  const handle = (a: Alarm) => { mark("hq-alarms-done", keyOf(a)); setRinging((r) => r.filter((x) => x.id !== a.id)); };
  const snooze = (a: Alarm) => { mark("hq-alarms-snooze", keyOf(a), 5 * 60000); setRinging((r) => r.filter((x) => x.id !== a.id)); };
  const done = async (a: Alarm) => { handle(a); const r = await completeTask(a.id); if (r.ok) { setAlarms((x) => x.filter((y) => y.id !== a.id)); router.refresh(); } };

  return (
    <>
      {canNotify === "default" && alarms.length > 0 && (
        <div className="fixed bottom-4 left-4 z-40 flex max-w-sm items-center gap-3 rounded-lg border border-misty bg-white px-3 py-2 text-sm shadow-lg">
          <span>Get a desktop alert when a timed task comes due?</span>
          <button type="button" className="btn btn-primary" onClick={async () => setCanNotify(await Notification.requestPermission())}>Turn on</button>
        </div>
      )}
      {ringing.length > 0 && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="alarm-h" className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="bg-coral px-5 py-4 text-white">
              <p className="text-sm font-semibold uppercase tracking-wider">⏰ Task due now</p>
              <h2 id="alarm-h" className="text-xl font-extrabold">{ringing.length === 1 ? ringing[0].title : `${ringing.length} tasks are due`}</h2>
            </div>
            <ul className="flex flex-col divide-y divide-misty">
              {ringing.map((a) => (
                <li key={a.id} className="flex flex-col gap-2 px-5 py-3">
                  <div>
                    {ringing.length > 1 && <b className="block">{a.title}</b>}
                    <span className="text-sm muted">Due {clock(a.time)}{a.personName ? ` · ${a.personName}` : ""}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn btn-primary" onClick={() => done(a)}>Done</button>
                    <button type="button" className="btn" onClick={() => snooze(a)}>Snooze 5 min</button>
                    {a.personId && <Link className="btn" href={`/people/${a.personId}`} onClick={() => handle(a)}>Open {a.personName?.split(" ")[0] ?? "contact"}</Link>}
                    <button type="button" className="btn ml-auto" onClick={() => handle(a)}>Dismiss</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
