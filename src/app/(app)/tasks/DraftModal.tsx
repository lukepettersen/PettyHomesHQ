"use client";

import { useEffect, useState, useTransition } from "react";
import { Modal } from "@/components/Modal";
import { MERGE_FIELDS } from "@/lib/merge";
import { getDraft } from "./draftActions";

type Draft = { kind: "email" | "text"; templateId: string | null; stepMessage: string | null; templates: { id: string; name: string }[]; to: string[]; subject: string; body: string; missing: string[] };

/** Draft email / Draft text: the filled-in template to review, then copy or open in the email app. */
export function DraftModal({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const [d, setD] = useState<Draft | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const load = (templateId?: string | null) => start(async () => {
    const r = await getDraft({ taskId, templateId });
    if (!r.ok) { setError(r.error); return; }
    setD(r.data as Draft); setSubject(r.data!.subject); setBody(r.data!.body); setError("");
  });
  useEffect(() => { load(); }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps
  const label = (k: string) => MERGE_FIELDS.find(([x]) => x === k)?.[1] ?? k;
  const copy = async () => {
    try { await navigator.clipboard.writeText(d?.kind === "email" ? `Subject: ${subject}\n\n${body}` : body); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setError("Couldn't copy. Select the text and copy it instead."); }
  };
  const mailto = d && d.kind === "email" ? `mailto:${d.to.join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : "";
  return (
    <Modal title={d?.kind === "text" ? "Draft text" : "Draft email"} onClose={onClose} wide>
      {!d && !error && <p className="text-sm muted">Filling in the template…</p>}
      {d && (
        <div className="flex flex-col gap-3">
          <label className="label">Template
            <select className="input" value={d.templateId ?? ""} disabled={pending} onChange={(e) => load(e.target.value || null)}>
              <option value="">{d.templates.length ? "Pick a template…" : `No ${d.kind} templates yet`}</option>
              {d.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          {d.stepMessage && !d.templateId && <p className="text-sm text-[#9a6400]">This step expects &quot;{d.stepMessage}&quot;, which hasn&apos;t been created yet. Add it in Admin → Text &amp; email templates, or pick another one.</p>}
          <p className="text-sm"><b>To:</b> {d.to.length ? d.to.join(", ") : <span className="text-bad">No {d.kind === "email" ? "email address" : "phone number"} on file</span>}</p>
          {d.kind === "email" && <label className="label">Subject<input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></label>}
          <label className="label">Message<textarea className="input min-h-56 font-normal" value={body} onChange={(e) => setBody(e.target.value)} /></label>
          {d.missing.length > 0 && <p className="text-sm text-[#9a6400]">Not filled in (nothing on file): {d.missing.map(label).join(", ")}. Check the message before sending.</p>}
          <p className="text-xs muted">{d.kind === "email" ? "Nothing is sent from HQ yet. Open it in your email app, or copy it. Gmail drafts come once Gmail is connected." : "Copy it and send it from your phone, then check off the task."}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn" onClick={onClose}>Close</button>
            <button type="button" className="btn" disabled={!body} onClick={copy}>{copied ? "Copied" : "Copy"}</button>
            {d.kind === "email" && <a className={`btn btn-primary ${body ? "" : "pointer-events-none opacity-50"}`} href={mailto}>Open in email</a>}
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    </Modal>
  );
}
