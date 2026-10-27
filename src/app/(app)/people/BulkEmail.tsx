"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import { FormatBar } from "@/components/FormatBar";
import { TemplateSearch } from "@/components/TemplateSearch";
import { AttachFiles, type Attached } from "@/components/AttachFiles";
import { toHtml } from "@/lib/email";
import { prepareBulkEmail, previewBulkEmail, sendBulkEmailBatch } from "./bulkEmailActions";

type Prep = { recipients: { personId: string; name: string }[]; skipped: { noEmail: number; optedOut: number }; sendsFrom: string | null; address: string; templates: { id: string; name: string; subject: string; body: string }[] };
const BATCH = 5;

/**
 * People → select → Email (SPEC.md §6.2): a template or your own words with merge fields, a preview as one
 * person gets it, then one email each from your Gmail, a few at a time with a progress bar.
 */
export function BulkEmail({ ids: picked, onClose }: { ids: string[]; onClose: () => void }) {
  const router = useRouter();
  const [ids] = useState(picked); // the people selected when it opened
  const [prep, setPrep] = useState<Prep | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [address, setAddress] = useState("");
  const [signature, setSignature] = useState(true);
  const [files, setFiles] = useState<Attached[]>([]);
  const [preview, setPreview] = useState<{ name: string; subject: string; body: string; missing: string[] } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [progress, setProgress] = useState<{ done: number; sent: number; skipped: number; waiting: boolean; failed: { name: string; error: string }[]; finished: boolean } | null>(null);
  const [error, setError] = useState("");
  const stop = useRef(false);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    prepareBulkEmail({ ids }).then((r) => { if (!r.ok) setError(r.error); else { setPrep(r.data!); setAddress(r.data!.address); } });
  }, [ids]);

  const pick = (id: string) => {
    setTemplateId(id); setPreview(null); setConfirm(false);
    const t = prep?.templates.find((x) => x.id === id);
    if (t) { setSubject(t.subject); setBody(t.body); }
  };
  const showPreview = async () => {
    const first = prep!.recipients[0];
    const r = await previewBulkEmail({ personId: first.personId, subject, body });
    if (!r.ok) { setError(r.error); return; }
    setPreview({ name: first.name, ...r.data! });
  };
  const send = async () => {
    if (!confirm) { setConfirm(true); return; }
    setConfirm(false); setError(""); stop.current = false;
    const list = prep!.recipients.map((r) => r.personId);
    const batch = crypto.randomUUID();
    let state = { done: 0, sent: 0, skipped: 0, waiting: false, failed: [] as { name: string; error: string }[], finished: false };
    setProgress(state);
    const queue = [...list];
    let pauses = 0;
    while (queue.length && !stop.current) {
      const chunk = queue.splice(0, BATCH);
      const r = await sendBulkEmailBatch({ personIds: chunk, subject, body, address, signature, batch, attachments: files });
      if (!r.ok) { setError(r.error); break; }
      const retry = r.data!.retry ?? [];
      state = { ...state, done: list.length - queue.length - retry.length, sent: state.sent + r.data!.sent, skipped: state.skipped + (r.data!.skipped ?? 0), failed: [...state.failed, ...r.data!.failed] };
      setProgress(state);
      if (r.data!.failed.some((f) => /isn't connected|didn't let HQ in/i.test(f.error))) break;
      if (retry.length) {
        // Gmail's per-minute limit: wait a minute and carry on with the rest (owner 2026-10-27).
        if (++pauses > 6) { state = { ...state, failed: [...state.failed, { name: `${retry.length + queue.length} people`, error: "Gmail kept saying slow down. Send it again later; anyone who already got it is skipped." }] }; break; }
        queue.unshift(...retry);
        setProgress({ ...state, waiting: true });
        await new Promise((ok) => setTimeout(ok, 65000));
        setProgress((p) => (p ? { ...p, waiting: false } : p));
        continue;
      }
      await new Promise((ok) => setTimeout(ok, 6000)); // about 50 a minute, under Gmail's per-minute limit
    }
    setProgress({ ...state, finished: true });
    router.refresh();
  };

  const n = prep?.recipients.length ?? 0;
  return (
    <Modal title="Email these people" onClose={progress && !progress.finished ? () => {} : onClose} wide>
      {!prep && !error && <p className="text-sm muted">Checking who can get it…</p>}
      {prep && !prep.sendsFrom && <p className="rounded-md bg-sunken px-3 py-2 text-sm">Gmail isn&apos;t connected. An Admin can connect it in Admin → Integrations (Connect Google).</p>}
      {prep && prep.sendsFrom && !progress && (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            <b>{n.toLocaleString()} {n === 1 ? "person" : "people"}</b> will get their own email from {prep.sendsFrom}.
            {(prep.skipped.noEmail > 0 || prep.skipped.optedOut > 0) && <span className="muted"> Skipped: {[prep.skipped.noEmail && `${prep.skipped.noEmail} with no email`, prep.skipped.optedOut && `${prep.skipped.optedOut} unsubscribed or bounced`].filter(Boolean).join(", ")}.</span>}
          </p>
          <label className="label">Template<TemplateSearch templates={prep.templates} value={templateId} onPick={pick} noneLabel="No email templates yet" /></label>
          <label className="label">Subject<input className="input" value={subject} onChange={(e) => { setSubject(e.target.value); setPreview(null); setConfirm(false); }} /></label>
          <div className="label">Message
            <div>
              <FormatBar box={box} value={body} onChange={(v) => { setBody(v); setPreview(null); setConfirm(false); }} />
              <textarea ref={box} aria-label="Message" className="input min-h-48 rounded-t-none font-normal" value={body} placeholder="Write here. {first_name} and other merge fields fill in for each person."
                onChange={(e) => { setBody(e.target.value); setPreview(null); setConfirm(false); }} />
            </div>
          </div>
          <AttachFiles files={files} onChange={setFiles} />
          <label className="label">Your business mailing address (shown at the bottom, with an unsubscribe link)
            <input className="input" value={address} onChange={(e) => { setAddress(e.target.value); setConfirm(false); }} placeholder="Street, city, state ZIP" />
          </label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={signature} onChange={(e) => setSignature(e.target.checked)} /> Add my Gmail signature</label>
          {preview && (
            <div className="rounded-md border border-misty bg-white p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wider muted">Preview for {preview.name}</p>
              <p className="mt-1 font-semibold">{preview.subject}</p>
              {/* toHtml escapes everything typed and adds only HQ's own tags (bold, links, lists, images). */}
              <div className="mt-1" dangerouslySetInnerHTML={{ __html: toHtml(preview.body) }} />
              <p className="mt-2 border-t border-misty pt-2 text-xs muted">Petty Homes LLC · {address || "(your address)"} · Don&apos;t want these emails? Unsubscribe</p>
              {preview.missing.length > 0 && <p className="mt-2 text-[#9a6400]">Empty for {preview.name}: {preview.missing.join(", ")}. People missing a field get a blank there.</p>}
            </div>
          )}
          {error && <p role="alert" className="text-sm text-bad">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="button" className="btn" disabled={!n || !subject.trim() || !body.trim()} onClick={showPreview}>Preview</button>
            <button type="button" className="btn btn-primary" disabled={!n || !subject.trim() || !body.trim() || address.trim().length < 8} onClick={send} onBlur={() => setConfirm(false)}>
              {confirm ? `Click again to send ${n.toLocaleString()} emails` : `Send to ${n.toLocaleString()}`}
            </button>
          </div>
        </div>
      )}
      {progress && (
        <div className="flex flex-col gap-3">
          <div className="h-3 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={n} aria-valuenow={progress.done}>
            <div className="h-full bg-accent transition-all" style={{ width: `${n ? (progress.done / n) * 100 : 0}%` }} />
          </div>
          <p className="text-sm" aria-live="polite">{progress.finished ? `Done. Sent ${progress.sent.toLocaleString()} of ${n.toLocaleString()}.` : progress.waiting ? `Gmail asked HQ to slow down. Waiting a minute, then sending the rest… (${progress.done.toLocaleString()} of ${n.toLocaleString()}). Keep this page open.` : `Sending… ${progress.done.toLocaleString()} of ${n.toLocaleString()}. Keep this page open.`}
            {progress.skipped > 0 && ` ${progress.skipped.toLocaleString()} already got this mass email in the last 24 hours, so they were skipped.`}</p>
          {progress.failed.length > 0 && (
            <details className="text-sm"><summary className="cursor-pointer text-bad">{progress.failed.length} didn&apos;t send</summary>
              <ul className="mt-1 list-disc pl-5">{progress.failed.map((f, i) => <li key={i}>{f.name}: {f.error}</li>)}</ul>
            </details>
          )}
          {error && <p role="alert" className="text-sm text-bad">{error}</p>}
          <div className="flex justify-end gap-2">
            {!progress.finished && <button type="button" className="btn" onClick={() => { stop.current = true; }}>Stop</button>}
            {progress.finished && <button type="button" className="btn btn-primary" onClick={onClose}>Close</button>}
          </div>
        </div>
      )}
    </Modal>
  );
}
