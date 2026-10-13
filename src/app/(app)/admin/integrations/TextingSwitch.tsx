"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setTexting } from "./actions";

export function TextingSwitch({ connected, on }: { connected: boolean; on: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md bg-sunken px-3 py-2">
      <button type="button" role="switch" aria-checked={on} aria-label="Texting on" disabled={!connected || pending}
        onClick={() => start(async () => { setError(""); const r = await setTexting(!on); if (!r.ok) setError(r.error); else router.refresh(); })}
        className={`relative h-6 w-11 flex-none rounded-full transition disabled:opacity-50 ${on ? "bg-accent" : "bg-rabbit"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-[22px]" : "left-0.5"}`} />
      </button>
      <span className="text-sm">{!connected ? "Texting is off until Twilio is connected." : on ? "Texting is on. Turn off to pause all sending." : "Texting is paused. Nothing is sent."}</span>
      {error && <span role="alert" className="text-sm text-bad">{error}</span>}
    </div>
  );
}
