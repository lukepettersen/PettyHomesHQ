"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fillEmailTemplate, sendEmail } from "../emailActions";

/** Timeline → Email: pick a template (optional), check it over, send from the connected Gmail (SPEC.md §12). */
export function EmailComposer({ personId, emails, templates, sendsFrom }: { personId: string; emails: string[]; templates: { id: string; name: string }[]; sendsFrom: string | null }) {
  const router = useRouter();
  const [to, setTo] = useState<string[]>(emails);
  const [templateId, setTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [missing, setMissing] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, start] = useTransition();

  if (!sendsFrom) return <p className="mt-2 rounded-md bg-sunken px-3 py-2 text-sm muted">Gmail isn&apos;t connected yet. An Admin can connect it in Admin → Integrations (Connect Google), then emails send from here and show on the timeline.</p>;
  if (!emails.length) return <p className="mt-2 rounded-md bg-sunken px-3 py-2 text-sm muted">No email address on file. Add one to their contact first.</p>;

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
      const r = await sendEmail({ personId, to, subject, body });
      if (!r.ok) { setError(r.error); return; }
      setNotice(`Sent to ${to.join(", ")}.`); setSubject(""); setBody(""); setTemplateId(""); setMissing([]); router.refresh();
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
      </fieldset>
      <label className="label">Template
        <select className="input" value={templateId} disabled={pending} onChange={(e) => pick(e.target.value)}>
          <option value="">{templates.length ? "None (write your own)" : "No email templates yet"}</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <label className="label">Subject<input className="input" value={subject} onChange={(e) => { setConfirm(false); setSubject(e.target.value); }} /></label>
      <label className="label">Message<textarea className="input min-h-40 font-normal" value={body} onChange={(e) => { setConfirm(false); setBody(e.target.value); }} /></label>
      {missing.length > 0 && <p className="text-sm text-[#9a6400]">Not filled in (nothing on file): {missing.join(", ")}. Check the message before sending.</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs muted">Sends from {sendsFrom}. A copy is in its Gmail Sent folder and here on the timeline.</span>
        <button type="button" className="btn btn-primary" disabled={pending || !to.length || !subject.trim() || !body.trim()} onClick={send} onBlur={() => setConfirm(false)}>
          {pending ? "Sending…" : confirm ? `Click again to send to ${to.length === 1 ? to[0] : `${to.length} addresses`}` : "Send email"}
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      {notice && <p role="status" className="text-sm text-accent">{notice}</p>}
    </div>
  );
}
