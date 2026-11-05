"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useSpeech } from "@/components/useSpeech";
import { allTypes, checksOf, paperSteps, paperType, shownFields, type PaperConfig } from "@/lib/paperwork";
import type { TeamMember } from "@/server/tasks";
import { paperworkSetup, submitPaperwork } from "../../pipeline/paperworkActions";

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
  const [cfg, setCfg] = useState<PaperConfig | null>(null);
  useEffect(() => { let on = true; paperworkSetup().then((r) => { if (on && r.ok) setCfg(r.data!); }); return () => { on = false; }; }, []);
  const custom = cfg?.custom ?? [];
  const types = allTypes(custom);
  const t = paperType(type, custom) ?? types[0];
  const fields = shownFields(t, values);
  const checks = checksOf(values);
  const toggle = (k: string) => setValues({ ...values, checks: (checks.includes(k) ? checks.filter((c) => c !== k) : [...checks, k]).join(",") });
  const request = { type: t.key, values: Object.fromEntries([...fields.map((f) => [f.key, values[f.key] ?? ""]), ...(t.options ? [["checks", values.checks ?? ""]] : [])]), notes };
  const steps = cfg ? paperSteps(request, personName, cfg.steps, custom) : [];

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
    const r = await submitPaperwork({ personId, toId, request });
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
          {types.map((p) => (
            <button key={p.key} type="button" role="radio" aria-checked={t.key === p.key} onClick={() => setType(p.key)}
              className={`rounded-full border px-3 py-1 text-sm font-semibold ${t.key === p.key ? "border-accent bg-accent text-white" : "border-misty bg-white hover:bg-sunken"}`}>{p.label}</button>
          ))}
        </div>
        {t.options && (
          <fieldset className="mt-3">
            <legend className="text-sm font-semibold">What&apos;s changing?</legend>
            <div className="mt-1 grid gap-1 sm:grid-cols-2">
              {t.options.map((o) => (
                <label key={o.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={checks.includes(o.key)} onChange={() => toggle(o.key)} />{o.label}</label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {fields.map((f) => (
            <label key={f.key} className={`text-sm font-semibold ${f.type === "long" || f.key === "address" || f.key === "form" ? "sm:col-span-2" : ""}`}>{f.label}{f.hint && <span className="ml-1 text-xs font-normal muted">{f.hint}</span>}
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
        {steps.length > 0 && (
          <details className="mt-3 rounded-lg border border-misty bg-paper px-3 py-2 text-sm">
            <summary className="cursor-pointer font-semibold">Steps on the task ({steps.length})</summary>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5">{steps.map((x, i) => <li key={i}>{x}</li>)}</ol>
            <p className="mt-1.5 text-xs muted">Change these in Admin → Paperwork steps.</p>
          </details>
        )}
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
