"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { FormatBar } from "@/components/FormatBar";
import { TemplateSearch, useSlashTemplates } from "@/components/TemplateSearch";
import { Modal } from "@/components/Modal";
import { useRouter } from "next/navigation";
import { getDraft } from "./draftActions";
import { sendEmail } from "../people/emailActions";
import { toPlain } from "@/lib/email";

type Draft = { kind: "email" | "text"; templateId: string | null; stepMessage: string | null; templates: { id: string; name: string }[]; to: string[]; subject: string; body: string; missing: string[]; personId: string | null; sendsFrom: string | null };

/** Draft email / Draft text: the filled-in template to review, then copy or open in the email app. */
export function DraftModal({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const [d, setD] = useState<Draft | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [signature, setSignature] = useState(true);
  const box = useRef<HTMLTextAreaElement>(null);
  const slash = useSlashTemplates({ box, value: body, templates: d?.templates ?? [], onChoose: (id, from, to) => start(async () => {
    const r = await getDraft({ taskId, templateId: id });
    if (!r.ok) { setError(r.error); return; }
    const next = body.slice(0, from) + r.data!.body + body.slice(to);
    setBody(next); if (!subject.trim()) setSubject(r.data!.subject);
    setD((x) => x && { ...x, templateId: id, missing: r.data!.missing });
  }) });
  const slashProps = { onKeyDown: slash.onKeyDown, onKeyUp: slash.track, onClick: slash.track };
  const router = useRouter();
  const canSend = !!(d && d.kind === "email" && d.sendsFrom && d.personId && d.to.length);
  const send = () => {
    if (!confirm) { setConfirm(true); return; }
    setConfirm(false); setError("");
    start(async () => {
      const r = await sendEmail({ personId: d!.personId!, taskId, to: d!.to, subject, body, signature });
      if (!r.ok) { setError(r.error); return; }
      router.refresh(); onClose();
    });
  };
  const load = (templateId?: string | null) => start(async () => {
    const r = await getDraft({ taskId, templateId });
    if (!r.ok) { setError(r.error); return; }
    setD(r.data as Draft); setSubject(r.data!.subject); setBody(r.data!.body); setError("");
  });
  useEffect(() => { load(); }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps
  const copy = async () => {
    try { await navigator.clipboard.writeText(d?.kind === "email" ? `Subject: ${subject}\n\n${toPlain(body)}` : body); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setError("Couldn't copy. Select the text and copy it instead."); }
  };
  const mailto = d && d.kind === "email" ? `mailto:${d.to.join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(toPlain(body))}` : "";
  return (
    <Modal title={d?.kind === "text" ? "Draft text" : "Draft email"} onClose={onClose} wide>
      {!d && !error && <p className="text-sm muted">Filling in the template…</p>}
      {d && (
        <div className="flex flex-col gap-3">
          <label className="label">Template
            <TemplateSearch templates={d.templates} value={d.templateId ?? ""} disabled={pending} onPick={(id) => load(id || null)} emptyLabel="Pick a template" noneLabel={`No ${d.kind} templates yet`} />
          </label>
          {d.stepMessage && !d.templateId && <p className="text-sm text-[#9a6400]">This step expects &quot;{d.stepMessage}&quot;, which hasn&apos;t been created yet. Add it in Admin → Text &amp; email templates, or pick another one.</p>}
          <p className="text-sm"><b>To:</b> {d.to.length ? d.to.join(", ") : <span className="text-bad">No {d.kind === "email" ? "email address" : "phone number"} on file</span>}</p>
          {d.kind === "email" && <label className="label">Subject<input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></label>}
          {canSend ? (
            <div className="label">Message
              <div>
                <FormatBar box={box} value={body} onChange={setBody} />
                <textarea ref={box} aria-label="Message" className="input min-h-56 rounded-t-none font-normal" value={body} onChange={(e) => { setBody(e.target.value); slash.track(); }} {...slashProps} />
                {slash.menu}
              </div>
            </div>
          ) : <div className="label">Message<textarea ref={box} aria-label="Message" className="input min-h-56 font-normal" value={body} onChange={(e) => { setBody(e.target.value); slash.track(); }} {...slashProps} />{slash.menu}</div>}
          {canSend && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={signature} onChange={(e) => setSignature(e.target.checked)} /> Add my Gmail signature</label>}
          {d.missing.length > 0 && <p className="text-sm text-[#9a6400]">Not filled in (nothing on file): {d.missing.join(", ")}. Check the message before sending.</p>}
          <p className="text-xs muted">{d.kind === "email" ? (canSend ? `Send email sends it from ${d.sendsFrom}, puts it on the timeline and checks off this task.` : "Gmail isn't connected, so HQ can't send it. Open it in your email app, or copy it. An Admin can connect Gmail in Admin → Integrations.") : "Copy it and send it from your phone, then check off the task."}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn" onClick={onClose}>Close</button>
            <button type="button" className="btn" disabled={!body} onClick={copy}>{copied ? "Copied" : "Copy"}</button>
            {d.kind === "email" && <a className={`btn ${canSend ? "" : "btn-primary"} ${body ? "" : "pointer-events-none opacity-50"}`} href={mailto}>Open in email</a>}
            {canSend && <button type="button" className="btn btn-primary" disabled={pending || !subject.trim() || !body.trim()} onClick={send} onBlur={() => setConfirm(false)}>
              {pending ? "Sending…" : confirm ? `Click again to send to ${d.to.length === 1 ? d.to[0] : `${d.to.length} addresses`}` : "Send email"}</button>}
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    </Modal>
  );
}
