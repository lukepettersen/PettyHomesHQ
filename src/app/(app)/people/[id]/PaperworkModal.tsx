"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useSpeech } from "@/components/useSpeech";
import { PAPER_TYPES, paperType } from "@/lib/paperwork";
import type { TeamMember } from "@/server/tasks";
import { submitPaperwork } from "../../pipeline/paperworkActions";

// Request paperwork (SPEC.md §7.5b): pick the form, check what HQ filled in from the deal, add notes (or talk),
// and it goes to Alyssa as a task due now, a bell alert and a text.
export function PaperworkModal({ personId, personName, kind, prefill, team, onClose, onSent }: {
  personId: string; personName: string; kind: "buyer" | "listing"; prefill: Record<string, string>; team: TeamMember[]; onClose: () => void; onSent: (msg: string) => void;
}) {
  const router = useRouter();
  const speech = useSpeech();
  const [type, setType] = useState(kind === "listing" ? "listing" : "amendment");
  const [values, setValues] = useState<Record<string, string>>(prefill);
  const [notes, setNotes] = useState("");
  const [toId, setToId] = useState(team.find((t) => !t.isOwner)?.id ?? team[0]?.id ?? "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const t = paperType(type)!;

  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose]);
  // What the mic heard goes into Notes when it stops.
  useEffect(() => {
    if (speech.listening || !speech.text.trim()) return;
    const said = speech.text.trim();
    const h = setTimeout(() => { setNotes((n) => (n ? `${n} ${said}` : said)); speech.clear(); }, 0);
    return () => clearTimeout(h);
  }, [speech.listening, speech.text, speech]);

  const send = () => start(async () => {
    setError("");
    const r = await submitPaperwork({ personId, toId, request: { type, values: Object.fromEntries(t.fields.map((f) => [f.key, values[f.key] ?? ""])), notes } });
    if (!r.ok) { setError(r.error); return; }
    onSent(`Sent to ${r.data!.to}: a task due now${r.data!.texted ? " and a text" : ""}. You'll get a heads-up when it's ready to sign.`);
    router.refresh();
  });

  const field = "input mt-1 w-full";
  const body = (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={`Request paperwork for ${personName}`}>
      <div className="card w-full max-w-lg p-5">
        <h2 className="text-lg font-extrabold">Request paperwork</h2>
        <p className="text-sm muted">For {personName}. It goes to ClickContracts to be written up.</p>
        <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Form">
          {PAPER_TYPES.map((p) => (
            <button key={p.key} type="button" role="radio" aria-checked={type === p.key} onClick={() => setType(p.key)}
              className={`rounded-full border px-3 py-1 text-sm font-semibold ${type === p.key ? "border-accent bg-accent text-white" : "border-misty bg-white hover:bg-sunken"}`}>{p.label}</button>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {t.fields.map((f) => (
            <label key={f.key} className={`text-sm font-semibold ${f.type === "long" || f.key === "address" || f.key === "form" ? "sm:col-span-2" : ""}`}>{f.label}
              {f.type === "long"
                ? <textarea className={field} rows={3} value={values[f.key] ?? ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
                : <input className={field} type={f.type === "date" ? "date" : "text"} inputMode={f.type === "money" ? "decimal" : undefined} value={values[f.key] ?? ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />}
            </label>
          ))}
          <label className="text-sm font-semibold sm:col-span-2">
            <span className="flex items-center justify-between">Notes
              {speech.supported && <button type="button" className="btn py-0.5 text-xs" onClick={() => (speech.listening ? speech.stop() : speech.start())}>{speech.listening ? "■ Stop" : "🎤 Talk"}</button>}
            </span>
            <textarea className={field} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything else to know" />
            {speech.listening && <span className="mt-1 block text-xs font-normal muted">Listening… {speech.text}</span>}
          </label>
          <label className="text-sm font-semibold sm:col-span-2">Send to
            <select className={field} value={toId} onChange={(e) => setToId(e.target.value)}>
              {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={pending || !toId} onClick={send}>{pending ? "Sending…" : "Send request"}</button>
        </div>
      </div>
    </div>
  );
  return createPortal(body, document.body);
}
