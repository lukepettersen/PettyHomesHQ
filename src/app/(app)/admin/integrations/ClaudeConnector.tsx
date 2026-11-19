"use client";

import { useState, useTransition } from "react";
import { disconnectClaude } from "./actions";

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).replace(" AM", "am").replace(" PM", "pm");

/** Owner only: the address to add in the Claude app, whether Claude is connected, and Disconnect (two-step). */
export function ClaudeConnector({ url, connected, lastUsedAt }: { url: string; connected: boolean; lastUsedAt: string | null }) {
  const [sure, setSure] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setError("Couldn't copy; select the address and copy it."); } };
  const off = () => start(async () => { setError(""); const r = await disconnectClaude(); if (!r.ok) setError(r.error); setSure(false); });
  return (
    <section className="card mt-4 p-5" aria-labelledby="claude-h">
      {/* Moved here from My settings (owner request 2026-11-19). Owner only. */}
      <h2 id="claude-h" className="font-bold">Claude app</h2>
      <p className="mt-1 text-sm muted">Lets Claude look up contacts, read and send texts on your HQ number, and add tasks, notes and contacts. In Claude: Settings → Connectors → Add custom connector, paste this address, then sign in to HQ and press Allow.</p>
      <div className="mt-3 flex items-center gap-2">
        <input readOnly value={url} aria-label="Connector address" className="min-w-0 flex-1 rounded-md border border-misty px-2 py-1.5 text-sm" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" onClick={copy} className="btn">{copied ? "Copied" : "Copy"}</button>
      </div>
      <p className="mt-3 text-sm">
        {connected ? <>Connected{lastUsedAt ? `, last used ${when(lastUsedAt)}` : ""}.</> : "Not connected."}
      </p>
      {connected && (
        <div className="mt-2 flex gap-2">
          {!sure ? (
            <button type="button" onClick={() => setSure(true)} className="btn">Disconnect</button>
          ) : (
            <>
              <button type="button" disabled={pending} onClick={off} className="btn btn-danger">{pending ? "Disconnecting…" : "Yes, disconnect"}</button>
              <button type="button" onClick={() => setSure(false)} className="btn">Cancel</button>
            </>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
    </section>
  );
}
