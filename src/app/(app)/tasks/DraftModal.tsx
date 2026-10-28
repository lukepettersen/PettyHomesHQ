"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { FormatBar } from "@/components/FormatBar";
import { EmailPreview } from "@/components/EmailPreview";
import { TemplateSearch, useSlashTemplates } from "@/components/TemplateSearch";
import { Modal } from "@/components/Modal";
import { useRouter } from "next/navigation";
import { getDraft } from "./draftActions";
import { sendEmail } from "../people/emailActions";
import { sendText, sendTextGroup } from "../messages/actions";
import { toPlain } from "@/lib/email";
import { AddRecipient, ExtraChips, PartyChecks, type Extra } from "@/components/AddRecipient";
import { ScheduleText } from "@/components/ScheduleText";

type Draft = { kind: "email" | "text"; templateId: string | null; stepMessage: string | null; templates: { id: string; name: string }[]; to: string[]; subject: string; body: string; missing: string[]; personId: string | null; sendsFrom: string | null; textBlocked: string | null; suggest: Extra[];
  copyIn: { name: string; value: string } | null; groups: boolean; phoneNames: { value: string; name: string }[] };

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
  const [extras, setExtras] = useState<Extra[]>([]); // the deal's lender/title/agents or anyone in HQ (owner request 2026-10-26)
  const [skip, setSkip] = useState<string[]>([]); // the contact's own emails unticked, e.g. a note just to title (owner request 2026-10-26)
  const [withOwner, setWithOwner] = useState(true); // the owner is copied in on a teammate's drafts, untick to leave out (owner request 2026-10-28)
  const copyIn = d?.copyIn && withOwner ? [d.copyIn.value] : [];
  const toAll = [...(d?.to ?? []).filter((e) => !skip.includes(e)), ...extras.map((x) => x.value), ...copyIn.filter((x) => !extras.some((e) => e.value.toLowerCase() === x.toLowerCase()))];
  // Draft text: every number ticked to start; two or more go as one group text (group texting on), else one text each.
  const phones = (d?.to ?? []).filter((n) => !skip.includes(n));
  const textTo = [...phones, ...(d?.kind === "text" ? copyIn : [])];
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
  const canSend = !!(d && d.kind === "email" && d.sendsFrom && d.personId);
  const canText = !!(d && d.kind === "text" && !d.textBlocked && d.personId && d.to.length);
  const text = () => start(async () => {
    setError("");
    if (d!.groups && textTo.length > 1) {
      const g = await sendTextGroup({ numbers: textTo, body, personId: d!.personId, taskId });
      if (!g.ok) { setError(g.error); return; }
    } else {
      for (const to of phones) {
        const r = await sendText({ personId: d!.personId, to, body, taskId });
        if (!r.ok) { setError(r.error); return; }
      }
    }
    router.refresh(); onClose();
  });
  const send = () => {
    // One click sends (owner request 2026-10-27); only mass emails ask twice.
    setConfirm(false); setError("");
    start(async () => {
      const r = await sendEmail({ personId: d!.personId!, taskId, to: toAll, subject, body, signature });
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
  const mailto = d && d.kind === "email" ? `mailto:${toAll.join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(toPlain(body))}` : "";
  return (
    <Modal title={d?.kind === "text" ? "Draft text" : "Draft email"} onClose={onClose} wide>
      {!d && !error && <p className="text-sm muted">Filling in the template…</p>}
      {d && (
        <div className="flex flex-col gap-3">
          <label className="label">Template
            <TemplateSearch templates={d.templates} value={d.templateId ?? ""} disabled={pending} onPick={(id) => load(id || null)} emptyLabel="Pick a template" noneLabel={`No ${d.kind} templates yet`} />
          </label>
          {d.stepMessage && !d.templateId && <p className="text-sm text-[#9a6400]">This step expects &quot;{d.stepMessage}&quot;, which hasn&apos;t been created yet. Add it in Admin → Text &amp; email templates, or pick another one.</p>}
          {d.kind === "email" ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <b>To:</b>
              {d.to.map((e) => (
                <label key={e} className="flex items-center gap-1"><input type="checkbox" checked={!skip.includes(e)} onChange={(x) => { setConfirm(false); setSkip(x.target.checked ? skip.filter((y) => y !== e) : [...skip, e]); }} /> {e}</label>
              ))}
              {!d.to.length && <span className="text-bad">No email address on file</span>}
              <ExtraChips extras={extras.filter((x) => !(d.suggest ?? []).some((p) => p.value === x.value))} onRemove={(v) => { setConfirm(false); setExtras(extras.filter((x) => x.value !== v)); }} />
              <AddRecipient mode="email" exclude={toAll.map((x) => x.toLowerCase())} onAdd={(x) => { setConfirm(false); setExtras([...extras, x]); }} />
              {d.copyIn && <label className="flex items-center gap-1"><input type="checkbox" checked={withOwner} onChange={(x) => setWithOwner(x.target.checked)} /> {d.copyIn.name}</label>}
              <PartyChecks parties={d.suggest ?? []} chosen={extras.map((x) => x.value)} onToggle={(x, on) => { setConfirm(false); setExtras(on ? [...extras, x] : extras.filter((y) => y.value !== x.value)); }} />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <b>To:</b>
              {d.phoneNames.map((x) => (
                <label key={x.value} className="flex items-center gap-1"><input type="checkbox" checked={!skip.includes(x.value)} onChange={(e) => setSkip(e.target.checked ? skip.filter((y) => y !== x.value) : [...skip, x.value])} /> <span title={x.value}>{x.name}</span></label>
              ))}
              {d.copyIn && <label className="flex items-center gap-1"><input type="checkbox" checked={withOwner} onChange={(e) => setWithOwner(e.target.checked)} /> {d.copyIn.name} <span className="muted">(cell)</span></label>}
              {!d.to.length && <span className="text-bad">No phone number on file</span>}
              {textTo.length > 1 && <span className="w-full text-xs muted">{d.groups ? "Sends as one group text; everyone sees the replies." : "Each number gets its own text."}</span>}
            </div>
          )}
          {d.kind === "email" && <label className="label">Subject<input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></label>}
          {canSend ? (
            <div className="label">Message
              <div>
                <FormatBar box={box} value={body} onChange={setBody} />
                <textarea ref={box} aria-label="Message" className="input min-h-56 rounded-t-none font-normal" value={body} onChange={(e) => { setBody(e.target.value); slash.track(); }} {...slashProps} />
                {slash.menu}
                <EmailPreview body={body} />
              </div>
            </div>
          ) : <div className="label">Message<textarea ref={box} aria-label="Message" className="input min-h-56 font-normal" value={body} onChange={(e) => { setBody(e.target.value); slash.track(); }} {...slashProps} />{slash.menu}</div>}
          {canSend && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={signature} onChange={(e) => setSignature(e.target.checked)} /> Add my Gmail signature</label>}
          {d.missing.length > 0 && <p className="text-sm text-[#9a6400]">Not filled in (nothing on file): {d.missing.join(", ")}. Check the message before sending.</p>}
          <p className="text-xs muted">{d.kind === "email" ? (canSend ? `Send email sends it from ${d.sendsFrom}, puts it on the timeline and checks off this task.` : "Gmail isn't connected, so HQ can't send it. Open it in your email app, or copy it. An Admin can connect Gmail in Admin → Integrations.") : canText ? "Send text sends it from your business number, puts it on the timeline and checks off this task." : `${d.textBlocked ? `${d.textBlocked} ` : ""}Copy it and send it from your phone, then check off the task.`}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn" onClick={onClose}>Close</button>
            <button type="button" className="btn" disabled={!body} onClick={copy}>{copied ? "Copied" : "Copy"}</button>
            {d.kind === "email" && <a className={`btn ${canSend ? "" : "btn-primary"} ${body ? "" : "pointer-events-none opacity-50"}`} href={mailto}>Open in email</a>}
            {canSend && <button type="button" className="btn btn-primary" disabled={pending || !toAll.length || !subject.trim() || !body.trim()} onClick={send} onBlur={() => setConfirm(false)}>
              {pending ? "Sending…" : "Send email"}</button>}
            {canText && <button type="button" className="btn btn-primary" disabled={pending || !body.trim() || !phones.length} onClick={text}>{pending ? "Sending…" : "Send text"}</button>}
            {/* Schedule it for later instead; the step is checked off when it goes out (owner request 2026-10-28). */}
            {canText && <ScheduleText numbers={d.groups ? textTo : phones} body={body} personId={d.personId} taskId={taskId} disabled={pending || !body.trim() || !phones.length} onScheduled={() => { router.refresh(); onClose(); }} />}
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    </Modal>
  );
}
