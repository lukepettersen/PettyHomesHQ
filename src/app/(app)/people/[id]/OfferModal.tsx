"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Modal } from "@/components/Modal";
import { useSpeech } from "@/components/useSpeech";
import { missingTerms, offerSummary, OPTIONAL, REQUIRED, termText, writtenStatementIncomplete, type OfferData } from "@/lib/offer";
import { organizeOffer, submitOffer } from "../../pipeline/offerActions";

// Submit offer (SPEC.md §7.5), Relay's flow inside HQ: talk (or type) the terms, Claude organizes them,
// keep talking to fill gaps, review the note, submit.
function Mic() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" /></svg>;
}

export function OfferModal({ personId, personName, buyerFiles, fileId: initialFile, onClose }: {
  personId: string; personName: string; buyerFiles: { id: string; label: string }[]; fileId: string | null; onClose: () => void;
}) {
  const router = useRouter();
  const speech = useSpeech();
  const [offer, setOffer] = useState<OfferData | null>(null);
  const [fileId, setFileId] = useState<string>(initialFile ?? (buyerFiles.length === 1 ? buyerFiles[0].id : ""));
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [pending, start] = useTransition();
  const missing = offer ? missingTerms(offer) : [];
  const wsGap = !!offer && writtenStatementIncomplete(offer);

  const organize = () => {
    speech.stop();
    const said = speech.text.trim();
    if (!said) { setError("Talk or type the offer terms first."); return; }
    start(async () => {
      setError("");
      const r = await organizeOffer({ transcript: said, current: offer });
      if (!r.ok) { setError(r.error); return; }
      setOffer(r.data!); speech.clear();
    });
  };
  const submit = () => start(async () => {
    setError("");
    const r = await submitOffer({ personId, fileId: fileId || null, offer });
    if (!r.ok) { setError(r.error); return; }
    const d = r.data!;
    setDone([`Offer submitted. It's on ${personName}'s timeline${d.mentioned.length ? ` for ${d.mentioned.join(" and ")}` : ""}`, d.started ? "a buyer deal was started" : d.moved ? `the deal moved to ${d.moved}` : "", d.tasks ? `${d.tasks} offer task${d.tasks === 1 ? "" : "s"} added` : "", d.emailed.length ? `emailed to ${d.emailed.join(" and ")}` : ""].filter(Boolean).join(", ") + ".");
    router.refresh();
  });

  if (done) return (
    <Modal title="Submit offer" onClose={onClose}>
      <p role="status" className="text-sm">{done}</p>
      <div className="mt-4 flex justify-end"><button type="button" className="btn btn-primary" onClick={onClose}>Done</button></div>
    </Modal>
  );

  return (
    <Modal title={`Submit offer · ${personName}`} onClose={onClose} wide>
      {buyerFiles.length > 1 && (
        <label className="label mb-3">Buyer deal
          <select className="input" value={fileId} onChange={(e) => setFileId(e.target.value)}>
            <option value="">Pick one…</option>
            {buyerFiles.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </label>
      )}
      {!reviewing ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {REQUIRED.map(([k, label]) => {
              const val = offer ? termText(offer, k) : "—";
              const blank = val === "—";
              return (
                <div key={k} className={`rounded-lg border p-2 ${blank ? "border-dashed border-misty" : "border-misty bg-white"}`}>
                  <p className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide muted">{label}{!blank && <span className="text-accent" aria-label="captured">✓</span>}</p>
                  <p className={`text-sm font-semibold ${blank ? "muted" : ""}`}>{val}</p>
                </div>
              );
            })}
          </div>
          {offer && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {OPTIONAL.map(([k, label]) => <span key={k}><span className="muted">{label}:</span> <b>{termText(offer, k)}</b></span>)}
              {offer.additionalNotes && <span className="basis-full"><span className="muted">Notes:</span> {offer.additionalNotes}</span>}
            </div>
          )}
          {offer && (missing.length > 0 || wsGap) && (
            <p className="rounded-md bg-sunken px-3 py-2 text-sm">Still needed: <b>{[...missing, ...(wsGap ? ["Written statement details"] : [])].join(", ")}</b>. Tap the mic and say them.</p>
          )}
          <div className="flex flex-col gap-2 rounded-lg border border-misty bg-paper p-3">
            <textarea className="input min-h-24 font-normal" aria-label="Offer terms" value={speech.text} onChange={(e) => speech.set(e.target.value)}
              placeholder={speech.listening ? "Listening… say the terms" : offer ? "Say or type more terms or changes" : "e.g. 2215 Hillside Ave Edina, 389k, 10 grand earnest, close November 20th, 10 day inspection, conventional 20 percent down, no seller paid costs, 2.5% buyer broker, all appliances included"} />
            <div className="flex flex-wrap items-center gap-2">
              {speech.supported
                ? <button type="button" className={`btn flex items-center gap-1.5 ${speech.listening ? "border-coral text-coral" : ""}`} aria-pressed={speech.listening} disabled={pending}
                    onClick={speech.listening ? speech.stop : speech.start}><Mic />{speech.listening ? "Stop" : offer ? "Talk more" : "Talk"}</button>
                : <span className="text-xs muted">This browser can&apos;t listen. Type, or tap the mic on your phone&apos;s keyboard.</span>}
              <button type="button" className="btn btn-primary ml-auto" disabled={pending || !speech.text.trim()} onClick={organize}>{pending ? "Organizing…" : offer ? "Add to offer" : "Organize"}</button>
            </div>
            {speech.error && <p className="text-xs text-bad">{speech.error}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {offer && <button type="button" className="btn" disabled={pending} onClick={() => { setOffer(null); speech.clear(); setError(""); }}>Start over</button>}
            <button type="button" className="btn ml-auto" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={pending || !offer || speech.listening || !!speech.text.trim()} onClick={() => setReviewing(true)}>Review</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm muted">This note goes on {personName}&apos;s timeline for the team, on the buyer deal, and starts the offer tasks.</p>
          {(missing.length > 0) && <p className="text-sm text-[#9a6400]">Not given: {missing.join(", ")} (shows as N/A).</p>}
          <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-md bg-sunken p-3 font-mono text-xs">{offerSummary(offer!)}</pre>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" disabled={pending} onClick={() => setReviewing(false)}>Back to edit</button>
            <button type="button" className="btn btn-primary ml-auto" disabled={pending || (buyerFiles.length > 1 && !fileId)} onClick={submit}>{pending ? "Submitting…" : "Submit offer"}</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
    </Modal>
  );
}
