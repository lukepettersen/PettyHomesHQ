"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Modal } from "@/components/Modal";
import { TemplateSearch } from "@/components/TemplateSearch";
import { TextPhotoButton, TextPhotoPreviews } from "@/components/TextPhotos";
import { OPT_OUT } from "@/lib/bulkText";
import { bulkTextStatus, prepareBulkText, previewBulkText, startBulkText, stopBulkText } from "./bulkTextActions";

type Prep = { recipients: { personId: string; name: string; numbers: number }[]; skipped: { noPhone: number; optedOut: number }; sendsFrom: string | null; cap: number; groups: boolean; days: number; templates: { id: string; name: string; subject: string; body: string }[] };

/**
 * People → select → Text (SPEC.md §6.2, owner request 2026-11-06): one text each from your HQ number (a couple as one
 * group text), sent slowly in the background: a random 1–2 minutes apart, 9am–7pm, within your daily limit.
 */
export function BulkText({ ids: picked, onClose }: { ids: string[]; onClose: () => void }) {
  const router = useRouter();
  const [ids] = useState(picked);
  const [prep, setPrep] = useState<Prep | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ name: string; body: string; missing: string[] } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ total: number; done: number; sent: number; skipped: number; failed: { name: string; error: string }[]; state: string; nextAt: string | null } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { prepareBulkText({ ids }).then((r) => { if (!r.ok) setError(r.error); else setPrep(r.data!); }); }, [ids]);
  useEffect(() => {
    if (!jobId) return;
    let live = true;
    const look = async () => {
      const r = await bulkTextStatus(jobId);
      if (!live) return;
      if (!r.ok) { setError(r.error); return; }
      setProgress(r.data!);
      if (r.data!.state !== "sending") { router.refresh(); return; }
      setTimeout(look, 10000);
    };
    look();
    return () => { live = false; };
  }, [jobId, router]);

  const pick = (id: string) => { setTemplateId(id); setPreview(null); setConfirm(false); const t = prep?.templates.find((x) => x.id === id); if (t) setBody(t.body); };
  const edit = (v: string) => { setBody(v); setPreview(null); setConfirm(false); };
  const showPreview = async () => {
    const first = prep!.recipients[0];
    const r = await previewBulkText({ personId: first.personId, body });
    if (!r.ok) { setError(r.error); return; }
    setPreview({ name: first.name, ...r.data! });
  };
  const send = async () => {
    if (!confirm) { setConfirm(true); return; }
    setConfirm(false); setError("");
    const r = await startBulkText({ personIds: prep!.recipients.map((x) => x.personId), body, media: photos });
    if (!r.ok) { setError(r.error); return; }
    setStartsAt(r.data!.startsAt); setJobId(r.data!.id);
  };

  const n = prep?.recipients.length ?? 0;
  const couples = prep?.recipients.filter((r) => r.numbers > 1).length ?? 0;
  return (
    <Modal title="Text these people" onClose={onClose} wide>
      {!prep && !error && <p className="text-sm muted">Checking who can get it…</p>}
      {prep && !prep.sendsFrom && <p className="rounded-md bg-sunken px-3 py-2 text-sm">Texting is off or you don&apos;t have an HQ number yet. An Admin can set it up in Admin → Integrations.</p>}
      {prep && prep.sendsFrom && !jobId && (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            <b>{n.toLocaleString()} {n === 1 ? "contact" : "contacts"}</b> get their own text from your HQ number ({prep.sendsFrom}).
            {couples > 0 && <> {couples.toLocaleString()} with two or more numbers {prep.groups ? "get one group text with all of them" : "get it on their first number (group texts are off in Admin → Integrations)"}.</>}
            {(prep.skipped.noPhone > 0 || prep.skipped.optedOut > 0) && <span className="muted"> Skipped: {[prep.skipped.noPhone && `${prep.skipped.noPhone} with no phone`, prep.skipped.optedOut && `${prep.skipped.optedOut} who replied STOP`].filter(Boolean).join(", ")}.</span>}
          </p>
          <p className="rounded-md bg-sunken px-3 py-2 text-sm">
            HQ sends them slowly so they read like you texting: one every 1–2 minutes, 9am–7pm, up to your daily limit of {prep.cap} texts.
            {" "}{prep.days > 1 ? <>This one takes about <b>{prep.days} days</b>.</> : "It finishes today or tomorrow, depending on the time."} You can close this; it keeps going.
          </p>
          <label className="label">Template<TemplateSearch templates={prep.templates} value={templateId} onPick={pick} noneLabel="No text templates yet" /></label>
          <label className="label">Text
            <textarea className="input min-h-32 font-normal" value={body} onChange={(e) => edit(e.target.value)} placeholder="Hey {first_name}! We're having our pie party Nov 26 at 4pm and would love to see you there." />
            <span className="text-xs font-normal muted">{"{first_name}"} fills in for each contact (a couple gets both names). &quot;{OPT_OUT}&quot; is added at the end. Write links out in full; carriers block short links.</span>
          </label>
          <div className="flex items-center gap-2"><TextPhotoButton photos={photos} onChange={setPhotos} /><span className="text-xs muted">Add a flyer (optional)</span></div>
          <TextPhotoPreviews photos={photos} onChange={setPhotos} />
          {preview && (
            <div className="rounded-md border border-misty bg-white p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wider muted">Preview for {preview.name}</p>
              <p className="mt-1 whitespace-pre-wrap">{preview.body}</p>
              {preview.missing.length > 0 && <p className="mt-2 text-[#9a6400]">Empty for {preview.name}: {preview.missing.join(", ")}. People missing a field get a blank there.</p>}
            </div>
          )}
          {error && <p role="alert" className="text-sm text-bad">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="button" className="btn" disabled={!n || !body.trim()} onClick={showPreview}>Preview</button>
            <button type="button" className="btn btn-primary" disabled={!n || !body.trim()} onClick={send} onBlur={() => setConfirm(false)}>
              {confirm ? `Click again to text ${n.toLocaleString()}` : `Text ${n.toLocaleString()}`}
            </button>
          </div>
        </div>
      )}
      {jobId && (
        <div className="flex flex-col gap-3">
          {progress && (
            <div className="h-3 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
              <div className="h-full bg-accent transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
          )}
          <p className="text-sm" aria-live="polite">
            {!progress ? "Starting…" : progress.state === "sending"
              ? `Sending… ${progress.sent.toLocaleString()} of ${progress.total.toLocaleString()} texted.${progress.nextAt ? ` Next one ${progress.nextAt}.` : ""}`
              : `${progress.state === "stopped" ? "Stopped" : "Done"}. Texted ${progress.sent.toLocaleString()} of ${progress.total.toLocaleString()}.`}
            {startsAt && progress?.state === "sending" && progress.sent === 0 && ` It's outside sending hours, so it starts ${startsAt}.`}
          </p>
          <p className="text-sm muted">You can close this. HQ keeps sending in the background; <Link href="/people/texts" className="link">People → Mass texts</Link> shows how it&apos;s going. Replies come into Messages.</p>
          {progress && progress.failed.length > 0 && (
            <details className="text-sm"><summary className="cursor-pointer text-bad">{progress.failed.length} didn&apos;t send</summary>
              <ul className="mt-1 list-disc pl-5">{progress.failed.map((f, i) => <li key={i}>{f.name}: {f.error}</li>)}</ul>
            </details>
          )}
          {error && <p role="alert" className="text-sm text-bad">{error}</p>}
          <div className="flex justify-end gap-2">
            {progress?.state === "sending" && <button type="button" className="btn" onClick={async () => { const r = await stopBulkText(jobId); if (!r.ok) setError(r.error); }}>Stop sending</button>}
            <button type="button" className="btn btn-primary" onClick={onClose}>Close</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
