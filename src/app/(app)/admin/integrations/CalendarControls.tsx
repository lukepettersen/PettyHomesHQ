"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { disconnectCalendar } from "./actions";

/** Connect / Disconnect Google: Calendar and sending Gmail (one connection for the team). */
export function CalendarControls({ keysSet, connected, email, gmail }: { keysSet: boolean; connected: boolean; email: string | null; gmail: { send: boolean; read: boolean } }) {
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
        <a href="/api/google/connect" aria-disabled={!keysSet} className={`btn btn-primary ml-auto ${keysSet ? "" : "pointer-events-none opacity-50"}`}>Connect Google</a>
      )}
      {error && <span role="alert" className="text-sm text-bad">{error}</span>}
      {connected && (
        <div className="flex w-full flex-wrap items-center gap-3 border-t border-misty pt-2">
          <span className="text-sm">
            <b>Gmail:</b> {gmail.send ? `Sending on, from ${email || "this account"}.` : "Sending not allowed yet."}{" "}
            {gmail.read ? "Emails to and from contacts show on their timelines, and your Gmail signature is added." : "Reconnect to show emails and replies on timelines and add your Gmail signature."}
          </span>
          {!(gmail.send && gmail.read) && <a href="/api/google/connect" className="btn btn-primary ml-auto">Reconnect Google</a>}
        </div>
      )}
    </div>
  );
}
