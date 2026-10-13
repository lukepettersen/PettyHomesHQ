"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/Modal";
import { groupsFor, type Answers, type FileKind, type Question } from "@/lib/files";
import type { StatusRow } from "@/server/files";
import { startFile, updateFile } from "./actions";

/** Start a buyer / Start a listing, or edit one. Questions change with the status (SPEC.md §7.1). */
export function FileForm({ kind, personId, personName, fileId, statuses, statusId, answers, canSeeCommission, onClose, onSaved }: {
  kind: FileKind; personId: string; personName: string; fileId?: string; statuses: StatusRow[]; statusId?: string | null; answers?: Answers;
  canSeeCommission: boolean; onClose: () => void; onSaved: (message: string) => void;
}) {
  const [status, setStatus] = useState(statusId && statuses.some((s) => s.id === statusId) ? statusId : statuses[0]?.id ?? "");
  const [v, setV] = useState<Answers>({ timeframe: "0–3 months", preapproved: "Not yet", ptype: "Single family", hoa: "No", newc: "No", ...answers });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const index = Math.max(0, statuses.findIndex((s) => s.id === status));
  const groups = groupsFor(kind, index, statuses.length)
    .map((g) => ({ ...g, questions: g.questions.filter((q) => canSeeCommission || !q.commission) }))
    .filter((g) => g.questions.length);
  const shownKeys = new Set(groups.flatMap((g) => g.questions.map((q) => q.key)));
  const noun = kind === "buyer" ? "buyer" : "listing";
  const title = fileId ? `Edit ${kind === "buyer" ? "buyer representation" : "listing"}` : `Start a ${noun}`;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const missing = groups.flatMap((g) => g.questions).filter((q) => q.required && !(v[q.key] ?? "").trim());
    if (missing.length) { setError(`Add the ${missing.map((q) => q.label.toLowerCase()).join(" and ")} first.`); return; }
    // Only send what's on screen; anything else on the file is kept as is.
    const sent = Object.fromEntries(Object.entries(v).filter(([k]) => shownKeys.has(k)));
    start(async () => {
      const r = fileId ? await updateFile({ id: fileId, statusId: status, answers: sent }) : await startFile({ personId, kind, statusId: status, answers: sent });
      if (!r.ok) { setError(r.error); return; }
      const st = statuses.find((s) => s.id === status)?.name ?? "";
      onSaved(fileId ? "Saved." : `${kind === "buyer" ? "Buyer" : "Listing"} started at ${st}.`);
    });
  };

  return (
    <Modal title={title} onClose={onClose} wide>
      <form onSubmit={submit} autoComplete="off" className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="label">Client<span className="py-1.5 text-sm font-semibold text-charcoal">{personName}</span></div>
          <label className="label">Status
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </div>
        {groups.map((g) => (
          <fieldset key={g.title} className="rounded-lg border border-misty px-3 pt-1 pb-3">
            <legend className="px-1 text-sm font-bold">{g.title}</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {g.questions.map((q) => <Field key={q.key} q={q} value={v[q.key] ?? ""} onChange={(x) => setV({ ...v, [q.key]: x })} />)}
            </div>
          </fieldset>
        ))}
        {fileId && <p className="text-xs muted">Answers to questions from other statuses are kept.</p>}
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={pending}>{fileId ? "Save changes" : `Start ${noun}`}</button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ q, value, onChange }: { q: Question; value: string; onChange: (v: string) => void }) {
  const label = `${q.label}${q.required ? " *" : ""}`;
  if (q.type === "choice") return (
    <label className="label">{label}
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {!q.options!.includes(value) && <option value="">—</option>}
        {q.options!.map((o) => <option key={o}>{o}</option>)}
      </select>
    </label>
  );
  return (
    <label className="label">{label}
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={q.placeholder ?? (q.type === "money" ? "$" : "")}
        type={q.type === "date" ? "date" : "text"} inputMode={q.type === "money" || q.type === "number" ? "numeric" : undefined} />
    </label>
  );
}
