"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { FormatBar } from "@/components/FormatBar";
import { TemplateSearch, useSlashTemplates } from "@/components/TemplateSearch";
import { fillEmailTemplate, sendEmail } from "../emailActions";
import { AddRecipient, ExtraChips, type Extra } from "@/components/AddRecipient";

/** Timeline → Email: pick a template (optional), check it over, send from the connected Gmail (SPEC.md §12). */
export function EmailComposer({ personId, emails, templates, sendsFrom, onSent }: { personId: string; emails: string[]; templates: { id: string; name: string }[]; sendsFrom: string | null; onSent?: () => void }) {
  const router = useRouter();
  const [to, setTo] = useState<string[]>(emails);
  const [extras, setExtras] = useState<Extra[]>([]); // other contacts or typed addresses (owner request 2026-10-20)
  const all = [...to, ...extras.map((x) => x.value)];
  const [templateId, setTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [missing, setMissing] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, start] = useTransition();
  const [signature, setSignature] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  // "/name" in the message puts that template in where the slash was (subject too, if it's empty).
  const slash = useSlashTemplates({ box, value: body, templates, onChoose: (id, from, to) => start(async () => {
    const r = await fillEmailTemplate({ personId, templateId: id });
    if (!r.ok) { setError(r.error); return; }
    const next = body.slice(0, from) + r.data!.body + body.slice(to);
    setBody(next); setTemplateId(id); setMissing(r.data!.missing); setConfirm(false);
    if (!subject.trim()) setSubject(r.data!.subject);
    const at = from + r.data!.body.length;
    requestAnimationFrame(() => { box.current?.focus(); box.current?.setSelectionRange(at, at); });
  }) });

  const clear = () => {
    if (!confirmClear) { setConfirmClear(true); return; }
    setConfirmClear(false); setSubject(""); setBody(""); setTemplateId(""); setMissing([]); setConfirm(false); setError(""); setNotice("");
  };
  if (!sendsFrom) return <p className="mt-2 rounded-md bg-sunken px-3 py-2 text-sm muted">Gmail isn&apos;t connected yet. An Admin can connect it in Admin → Integrations (Connect Google), then emails send from here and show on the timeline.</p>;

  const pick = (id: string) => {
    setTemplateId(id); setError(""); setConfirm(false);
    if (!id) return;
    start(async () => {
      const r = await fillEmailTemplate({ personId, templateId: id });
      if (!r.ok) { setError(r.error); return; }
      setSubject(r.data!.subject); setBody(r.data!.body); setMissing(r.data!.missing);
    });
  };
  const send = () => {
    if (!confirm) { setConfirm(true); return; }
    setConfirm(false); setError("");
    start(async () => {
      const r = await sendEmail({ personId, to: all, subject, body, signature });
      if (!r.ok) { setError(r.error); return; }
      setNotice(`Sent to ${all.join(", ")}.`); setSubject(""); setBody(""); setTemplateId(""); setMissing([]); setExtras([]); router.refresh(); onSent?.();
    });
  };
  return (
    <div className="mt-2 flex flex-col gap-2">
      <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <legend className="sr-only">Send to</legend>
        <b>To:</b>
        {emails.map((e) => (
          <label key={e} className="flex items-center gap-1"><input type="checkbox" checked={to.includes(e)} onChange={(x) => { setConfirm(false); setTo(x.target.checked ? [...to, e] : to.filter((y) => y !== e)); }} /> {e}</label>
        ))}
        {!emails.length && <span className="muted">No email on file for them.</span>}
        <ExtraChips extras={extras} onRemove={(v) => { setConfirm(false); setExtras(extras.filter((x) => x.value !== v)); }} />
        <AddRecipient mode="email" exclude={all.map((x) => x.toLowerCase())} onAdd={(x) => { setConfirm(false); setExtras([...extras, x]); }} />
      </fieldset>
      <label className="label">Template
        <TemplateSearch templates={templates} value={templateId} disabled={pending} onPick={pick} noneLabel="No email templates yet" />
      </label>
      <label className="label">Subject<input className="input" value={subject} onChange={(e) => { setConfirm(false); setSubject(e.target.value); }} /></label>
      <div className="label">Message
        <div>
          <FormatBar box={box} value={body} onChange={(v) => { setConfirm(false); setBody(v); }} />
          <textarea ref={box} aria-label="Message" placeholder="Write here, or type / and a template name" className="input min-h-40 rounded-t-none font-normal" value={body}
            onChange={(e) => { setConfirm(false); setBody(e.target.value); slash.track(); }} onKeyDown={slash.onKeyDown} onKeyUp={slash.track} onClick={slash.track} />
          {slash.menu}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={signature} onChange={(e) => setSignature(e.target.checked)} /> Add my Gmail signature</label>
      {missing.length > 0 && <p className="text-sm text-[#9a6400]">Not filled in (nothing on file): {missing.join(", ")}. Check the message before sending.</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs muted">Sends from {sendsFrom}. A copy is in its Gmail Sent folder and here on the timeline.</span>
        <span className="flex gap-2">
        {(subject || body || templateId) && <button type="button" className="btn" disabled={pending} onClick={clear} onBlur={() => setConfirmClear(false)}>{confirmClear ? "Click again to clear" : "Clear"}</button>}
        <button type="button" className="btn btn-primary" disabled={pending || !all.length || !subject.trim() || !body.trim()} onClick={send} onBlur={() => setConfirm(false)}>
          {pending ? "Sending…" : confirm ? `Click again to send to ${all.length === 1 ? all[0] : `${all.length} addresses`}` : "Send email"}
        </button>
        </span>
      </div>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      {notice && <p role="status" className="text-sm text-accent">{notice}</p>}
    </div>
  );
}
