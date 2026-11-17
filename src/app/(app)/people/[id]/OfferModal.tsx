"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useSpeech } from "@/components/useSpeech";
import { missingTerms, offerSummary, OPTIONAL, REQUIRED, termText, writtenStatementIncomplete, type OfferData } from "@/lib/offer";
import { organizeOffer, submitOffer } from "../../pipeline/offerActions";

// Submit offer (SPEC.md §7.5), laid out like Relay: client card, term tiles with a check circle,
// optional clauses as checkboxes, and one big mic. Stopping the mic organizes what was said.
const MicIcon = ({ size = 28 }: { size?: number }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" /></svg>
);
const Check = () => <svg aria-hidden="true" width="10" height="10" viewBox="0 0 16 16"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>;

export function OfferModal({ personId, personName, buyerFiles, fileId: initialFile, onClose }: {
  personId: string; personName: string; buyerFiles: { id: string; label: string }[]; fileId: string | null; onClose: () => void;
}) {
  const router = useRouter();
  const speech = useSpeech();
  const [offer, setOffer] = useState<OfferData | null>(null);
  const [fileId, setFileId] = useState<string>(initialFile ?? (buyerFiles.length === 1 ? buyerFiles[0].id : ""));
  const [reviewing, setReviewing] = useState(false);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [pending, start] = useTransition();
  const stopped = useRef(false); // the mic was stopped by a tap, so organize what was heard
  const missing = offer ? missingTerms(offer) : [];
  const wsGap = !!offer && writtenStatementIncomplete(offer);

  const organize = (said = speech.text.trim()) => {
    if (!said) { setError("Talk or type the offer terms first."); return; }
    start(async () => {
      setError("");
      const r = await organizeOffer({ transcript: said, current: offer });
      if (!r.ok) { setError(r.error); return; }
      setOffer(r.data!); speech.clear(); setTyping(false);
    });
  };
  // Tap to stop → organize right away (like Relay). If the browser stops on its own, the words stay and a tap continues.
  useEffect(() => {
    if (speech.listening || !stopped.current) return;
    stopped.current = false;
    const said = speech.text.trim();
    const t = setTimeout(() => { if (said) organize(said); }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.listening]);
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose]);

  const mic = () => { if (speech.listening) { stopped.current = true; speech.stop(); } else { setError(""); speech.start(); } };
  const submit = () => start(async () => {
    setError("");
    const r = await submitOffer({ personId, fileId: fileId || null, offer });
    if (!r.ok) { setError(r.error); return; }
    const d = r.data!;
    setDone([`Offer submitted. It's on ${personName}'s timeline${d.mentioned.length ? ` for ${d.mentioned.join(" and ")}` : ""}`, d.started ? "a buyer deal was started" : d.moved ? `the deal moved to ${d.moved}` : "", d.tasks ? `${d.tasks} offer task${d.tasks === 1 ? "" : "s"} added` : "", d.emailed.length ? `emailed to ${d.emailed.join(" and ")}` : ""].filter(Boolean).join(", ") + ".");
    router.refresh();
  });
  const status = pending && !reviewing ? "Organizing…" : speech.listening ? "Listening… tap to stop" : speech.text.trim() ? "Tap to keep talking" : offer ? "Tap to add or change terms" : "Tap to record";

  const body = (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#e9e3d8] md:grid md:place-items-center md:bg-black/40 md:p-6" role="dialog" aria-modal="true" aria-label={`Submit offer for ${personName}`}>
      <div className="mx-auto flex min-h-full w-full max-w-xl flex-col gap-4 px-4 py-4 md:min-h-0 md:rounded-2xl md:bg-[#e9e3d8] md:p-6 md:shadow-2xl">
        <button type="button" onClick={onClose} className="flex items-center gap-1 self-start text-sm muted hover:text-charcoal">‹ Back</button>

        <div className="flex items-center gap-3 rounded-2xl border border-misty bg-white/60 p-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-accent-soft text-accent">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
          </span>
          <span className="min-w-0 flex-1"><span className="block text-[11px] font-semibold uppercase tracking-wider muted">Client</span><b className="block truncate">{personName}</b></span>
          {buyerFiles.length > 1 && (
            <select aria-label="Buyer deal" className="input w-auto max-w-[45%] text-xs" value={fileId} onChange={(e) => setFileId(e.target.value)}>
              <option value="">Pick deal…</option>{buyerFiles.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          )}
        </div>

        {done ? (
          <div className="flex flex-col gap-4 rounded-2xl bg-white/70 p-4">
            <p role="status" className="text-sm">{done}</p>
            <button type="button" className="btn btn-primary self-end" onClick={onClose}>Done</button>
          </div>
        ) : !reviewing ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              {REQUIRED.map(([k, label]) => {
                const val = offer ? termText(offer, k) : "—";
                const got = val !== "—";
                return (
                  <div key={k} className={`relative rounded-2xl border p-2.5 ${got ? "border-misty bg-white" : "border-transparent bg-white/40"}`}>
                    <span className={`absolute right-2 top-2 grid h-4 w-4 place-items-center rounded-full ${got ? "bg-accent text-white" : "border border-rabbit"}`}>{got && <Check />}</span>
                    <p className="pr-5 text-[11px] leading-tight muted">{label}</p>
                    <p className={`mt-1 line-clamp-2 break-words text-xs font-bold leading-tight ${got ? "" : "muted"}`} title={got ? val : undefined}>{val}</p>
                  </div>
                );
              })}
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider muted">Optional clauses</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                {OPTIONAL.map(([k, label]) => {
                  const val = offer ? termText(offer, k) : "No";
                  const on = val !== "No";
                  const detail = on && val !== "Yes" ? val.replace(/^Yes\s*—\s*/, "") : "";
                  return (
                    <div key={k} className={`flex items-start gap-2 text-sm ${detail ? "col-span-2" : ""}`}>
                      <span className={`mt-0.5 grid h-4 w-4 flex-none place-items-center rounded border ${on ? "border-accent bg-accent text-white" : "border-rabbit bg-white/50"}`}>{on && <Check />}</span>
                      <span className={on ? "" : "muted"}>{label}{detail && <span className="block text-xs font-semibold text-charcoal">{detail}</span>}</span>
                    </div>
                  );
                })}
              </div>
              {offer?.additionalNotes && <p className="mt-2 text-xs"><span className="muted">Notes:</span> {offer.additionalNotes}</p>}
            </div>

            {offer && (missing.length > 0 || wsGap) && (
              <p className="rounded-xl bg-white/60 px-3 py-2 text-sm">Still needed: <b>{[...missing, ...(wsGap ? ["Written statement details"] : [])].join(", ")}</b></p>
            )}

            <div className="flex flex-col items-center gap-2 py-2">
              {speech.supported && !typing ? (
                <>
                  <button type="button" onClick={mic} disabled={pending} aria-pressed={speech.listening} aria-label={speech.listening ? "Stop recording" : "Record offer terms"}
                    className={`grid h-24 w-24 place-items-center rounded-full border-2 shadow-lg transition ${speech.listening ? "animate-pulse border-coral bg-coral text-white" : "border-accent bg-[#f8f6f1] text-accent hover:bg-white"} disabled:opacity-60`}>
                    <MicIcon size={34} />
                  </button>
                  <p className="text-lg muted" aria-live="polite">{status}</p>
                  {speech.text && <p className="max-w-md text-center text-sm italic">&ldquo;{speech.text}&rdquo;</p>}
                  {speech.text && !speech.listening && !pending && (
                    <span className="flex gap-2"><button type="button" className="btn" onClick={speech.clear}>Clear</button><button type="button" className="btn btn-primary" onClick={() => organize()}>Organize</button></span>
                  )}
                  <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={() => { speech.stop(); setTyping(true); }}>Type instead</button>
                </>
              ) : (
                <div className="flex w-full flex-col gap-2">
                  <textarea className="input min-h-24 font-normal" aria-label="Offer terms" value={speech.text} onChange={(e) => speech.set(e.target.value)} autoFocus
                    placeholder={offer ? "Type more terms or changes" : "e.g. 2215 Hillside Ave Edina, 389k, 10 grand earnest, close November 20th, 10 day inspection, conventional 20% down, no seller paid costs, 2.5% buyer broker, all appliances included"} />
                  <span className="flex items-center gap-2">
                    {speech.supported && <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={() => setTyping(false)}>Use the mic</button>}
                    {!speech.supported && <span className="text-xs muted">Tip: tap the mic on your phone&apos;s keyboard to talk.</span>}
                    <button type="button" className="btn btn-primary ml-auto" disabled={pending || !speech.text.trim()} onClick={() => organize()}>{pending ? "Organizing…" : offer ? "Add to offer" : "Organize"}</button>
                  </span>
                </div>
              )}
              {speech.error && <p className="text-xs text-bad">{speech.error}</p>}
            </div>

            <div className="mt-auto flex gap-2">
              {offer && <button type="button" className="btn" disabled={pending} onClick={() => { setOffer(null); speech.clear(); setError(""); }}>Start over</button>}
              <button type="button" className="btn btn-primary flex-1 py-3 text-base" disabled={pending || !offer || speech.listening || !!speech.text.trim()} onClick={() => setReviewing(true)}>Review offer</button>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm muted">This note goes on {personName}&apos;s timeline for the team, on the buyer deal, and starts the offer tasks.</p>
            {missing.length > 0 && <p className="text-sm text-[#9a6400]">Not given: {missing.join(", ")} (shows as N/A).</p>}
            <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-xl bg-white/70 p-3 font-mono text-xs">{offerSummary(offer!)}</pre>
            <div className="flex gap-2">
              <button type="button" className="btn" disabled={pending} onClick={() => setReviewing(false)}>Back to edit</button>
              <button type="button" className="btn btn-primary flex-1 py-3 text-base" disabled={pending || (buyerFiles.length > 1 && !fileId)} onClick={submit}>{pending ? "Submitting…" : "Submit offer"}</button>
            </div>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      </div>
    </div>
  );
  return createPortal(body, document.body);
}
