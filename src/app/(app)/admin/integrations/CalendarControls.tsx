"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { disconnectCalendar } from "./actions";

/** Connect / Disconnect Google Calendar (one connection for the team). */
export function CalendarControls({ keysSet, connected, email }: { keysSet: boolean; connected: boolean; email: string | null }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md bg-sunken px-3 py-2">
      <span className="text-sm">
        <b>Calendar:</b> {connected ? `Connected${email ? ` to ${email}` : ""}. Appointments and contract dates go on this calendar with invites.` : "Not connected. Appointments are saved in HQ only."}
      </span>
      {connected ? (
        <button type="button" className="btn btn-danger ml-auto" disabled={pending} onBlur={() => setConfirm(false)}
          onClick={() => { if (!confirm) { setConfirm(true); return; } start(async () => { const r = await disconnectCalendar(); if (!r.ok) setError(r.error); else router.refresh(); }); }}>
          {confirm ? "Click again to disconnect" : "Disconnect"}
        </button>
      ) : (
        <a href="/api/google/connect" aria-disabled={!keysSet} className={`btn btn-primary ml-auto ${keysSet ? "" : "pointer-events-none opacity-50"}`}>Connect Google Calendar</a>
      )}
      {error && <span role="alert" className="text-sm text-bad">{error}</span>}
    </div>
  );
}
