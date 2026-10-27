"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Call, Device } from "@twilio/voice-sdk";
import { formatPhone, normalizePhone } from "@/lib/normalize";

// Calling in HQ, like FUB (owner request 2026-10-27): calls go out from your HQ number through the computer's mic
// and speakers, and calls to your HQ number ring here while HQ is open. Nothing uses your cell.
declare global { interface Window { hqCall?: (number: string, name?: string) => void } }

type Live = { call: Call; who: string; number: string; state: "ringing" | "incoming" | "live"; since: number | null };

/** Start an HQ call from anywhere: a "Call" link uses it when HQ calling is ready, else the phone's dialer. */
export function CallLink({ number, name, className, children }: { number: string; name?: string; className?: string; children: React.ReactNode }) {
  return <a className={className} href={`tel:${number}`} onClick={(e) => { if (window.hqCall) { e.preventDefault(); window.hqCall(number, name); } }}>{children}</a>;
}

export function CallCenter() {
  const device = useRef<Device | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [muted, setMuted] = useState(false);
  const [keypad, setKeypad] = useState(false);
  const [note, setNote] = useState("");
  const [now, setNow] = useState(0);

  const watch = useCallback((call: Call, who: string, number: string, state: Live["state"]) => {
    setLive({ call, who, number, state, since: null }); setMuted(false); setKeypad(false); setNote("");
    const end = (msg = "") => { setLive((l) => (l?.call === call ? null : l)); if (msg) setNote(msg); };
    call.on("accept", () => setLive((l) => (l?.call === call ? { ...l, state: "live", since: Date.now() } : l)));
    call.on("disconnect", () => end());
    call.on("cancel", () => end(`Missed call from ${who}`));
    call.on("reject", () => end());
    call.on("error", (e: { message?: string }) => end(`Call problem: ${e?.message ?? "try again"}`));
  }, []);

  useEffect(() => {
    let stopped = false;
    const report = (state: "ready" | "error", message?: string) =>
      fetch("/api/voice/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state, message: message?.slice(0, 200) }) }).catch(() => null);
    const token = async () => {
      const r = await fetch("/api/voice/token", { cache: "no-store" }).then((x) => x.json()).catch(() => null) as { token?: string; error?: string } | null;
      if (r?.error) setNote(r.error);
      return r?.token ?? null;
    };
    (async () => {
      const t = await token();
      if (!t || stopped) return;
      const { Device, Call } = await import("@twilio/voice-sdk");
      const d = new Device(t, { closeProtection: true, codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU] });
      device.current = d;
      d.on("tokenWillExpire", async () => { const n = await token(); if (n) d.updateToken(n); });
      d.on("incoming", async (call: Call) => {
        const from = normalizePhone(call.parameters.From ?? "");
        watch(call, formatPhone(from), from, "incoming");
        const hit = await fetch(`/api/search?q=${from}`).then((x) => x.json()).catch(() => null) as { results?: { name: string }[] } | null;
        const name = hit?.results?.[0]?.name;
        if (name) setLive((l) => (l?.call === call ? { ...l, who: name } : l));
      });
      // Problems show here and in Admin → Integrations → troubleshooting, so a call that never rings HQ can be explained.
      let told = false;
      d.on("registered", () => { if (!told) { told = true; report("ready"); } });
      d.on("error", (e: { message?: string; code?: number }) => {
        const msg = `${e?.message ?? "unknown"}${e?.code ? ` (${e.code})` : ""}`;
        console.error("HQ calling:", msg); report("error", msg); setNote(`HQ phone problem: ${msg}`);
      });
      await d.register().catch(() => null);
      window.hqCall = async (number: string, name?: string) => {
        const to = normalizePhone(number);
        if (to.length !== 10) { setNote("That number can't be called."); return; }
        if (device.current?.isBusy) { setNote("Finish the call you're on first."); return; }
        try { const call = await d.connect({ params: { To: `+1${to}` } }); watch(call, name || formatPhone(to), to, "ringing"); }
        catch { setNote("Couldn't start the call. Check that HQ may use your microphone."); }
      };
    })();
    return () => { stopped = true; delete window.hqCall; device.current?.destroy(); device.current = null; };
  }, [watch]);

  useEffect(() => { if (live?.state !== "live") return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [live?.state]);
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(""), 8000); return () => clearTimeout(t); }, [note]);

  if (!live) return note ? <div role="status" className="fixed bottom-4 left-4 z-[70] rounded-lg bg-charcoal px-3 py-2 text-sm text-white shadow-xl">{note}</div> : null;
  const secs = live.since ? Math.max(0, Math.floor((now - live.since) / 1000)) : 0;
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  return (
    <div role="dialog" aria-label="Phone call" className="fixed bottom-4 left-4 z-[70] w-72 rounded-xl border border-misty bg-white p-3 shadow-2xl">
      <p className="text-xs font-semibold uppercase tracking-wider muted">{live.state === "incoming" ? "Incoming call" : live.state === "ringing" ? "Calling…" : `On a call · ${clock}`}</p>
      <p className="mt-0.5 text-lg font-bold">{live.who}</p>
      {live.who !== formatPhone(live.number) && <p className="text-sm muted">{formatPhone(live.number)}</p>}
      {live.state === "incoming" ? (
        <div className="mt-3 flex gap-2">
          <button type="button" className="btn btn-primary flex-1" onClick={() => live.call.accept()}>Answer</button>
          <button type="button" className="btn btn-danger flex-1" onClick={() => live.call.reject()}>Decline</button>
        </div>
      ) : (
        <>
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn flex-1" aria-pressed={muted} onClick={() => { live.call.mute(!muted); setMuted(!muted); }}>{muted ? "Unmute" : "Mute"}</button>
            <button type="button" className="btn flex-1" aria-expanded={keypad} onClick={() => setKeypad(!keypad)}>Keypad</button>
            <button type="button" className="btn btn-danger flex-1" onClick={() => live.call.disconnect()}>Hang up</button>
          </div>
          {keypad && (
            <div className="mt-2 grid grid-cols-3 gap-1">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((k) => <button key={k} type="button" className="btn py-1" onClick={() => live.call.sendDigits(k)}>{k}</button>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
