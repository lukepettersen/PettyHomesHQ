"use client";

import { useState, useTransition } from "react";
import { renewLeadLink } from "./actions";

/** Admin → Integrations → Website leads: the private link for the website form's Webhook, with Copy and New link. */
export function WebsiteLeads({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <section className="card mt-4 flex flex-col gap-3 p-4" aria-labelledby="int-leads">
      <div className="flex items-start justify-between gap-2">
        <h2 id="int-leads" className="font-bold">Website leads</h2>
        <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">Ready</span>
      </div>
      <p className="text-sm">
        Your website form sends each lead here: a new contact (Source &quot;Website&quot;, stage Lead) or a note on someone already in HQ, a text to your cell,
        and any checklist set to start &quot;When a website lead comes in&quot;. The link below is private: it can only add leads, never read anything.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-sunken px-2 py-1.5 text-[12.5px]" title={link}>{link}</code>
        <button type="button" className="btn" onClick={() => { navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => setError("Couldn't copy; select the link and copy it.")); }}>{copied ? "Copied" : "Copy link"}</button>
        <button type="button" className="btn" disabled={pending} onBlur={() => setConfirm(false)}
          onClick={() => { if (!confirm) { setConfirm(true); return; } start(async () => { const r = await renewLeadLink(); if (!r.ok) setError(r.error); setConfirm(false); }); }}>
          {confirm ? "Click again: the old link stops working" : "New link"}</button>
      </div>
      <p className="text-xs muted">In WordPress: edit the page with the form in Elementor → click the form → Actions After Submit → add <b>Webhook</b> → paste this link into Webhook URL → Update.</p>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    </section>
  );
}
