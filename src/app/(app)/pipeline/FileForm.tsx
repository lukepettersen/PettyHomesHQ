"use client";

import { AddressInput } from "@/components/AddressInput";
import { useState, useTransition } from "react";
import { Modal } from "@/components/Modal";
import { MoneyOrPctInput } from "@/components/MoneyOrPctInput";
import { moneyTyped, pctShown, sectionsAt, type Answers, type FileKind, type FileSection } from "@/lib/files";
import type { PaField } from "@/lib/pa";
import { DateTimeInput } from "@/components/TimeSelect";
import type { StatusRow } from "@/server/files";
import { startFile, updateFile } from "./actions";

/** Start a buyer / Start a listing, or edit one. Questions change with the status (SPEC.md §7.1). */
export function FileForm({ kind, personId, personName, fileId, statuses, statusId, answers, canSeeCommission, form, onClose, onSaved }: {
  kind: FileKind; form: FileSection[]; personId: string; personName: string; fileId?: string; statuses: StatusRow[]; statusId?: string | null; answers?: Answers;
  canSeeCommission: boolean; onClose: () => void; onSaved: (message: string) => void;
}) {
  const [status, setStatus] = useState(statusId && statuses.some((s) => s.id === statusId) ? statusId : statuses[0]?.id ?? "");
  const [v, setV] = useState<Answers>({ ...(kind === "listing" ? { ptype: "Single family", hoa: "No", newc: "No" } : {}), ...answers });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  // The questions for this status come from Admin → Buyer and seller forms.
  const groups = sectionsAt(form, status, v)
    .map((g) => ({ ...g, fields: g.fields.filter((q) => canSeeCommission || !["commission", "bac"].includes(q.key)) }))
    .filter((g) => g.fields.length);
  const shownKeys = new Set(groups.flatMap((g) => g.fields.map((q) => q.key)));
  const noun = kind === "buyer" ? "buyer" : "seller";
  const title = fileId ? `Edit ${noun}` : `Start a ${noun}`;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const missing = groups.flatMap((g) => g.fields).filter((q) => q.required && !(v[q.key] ?? "").trim() && !(q.type === "date-na" && v[`${q.key}_na`] === "yes")); // N/A ticked counts as answered
    if (missing.length) { setError(`Add the ${missing.map((q) => q.label.toLowerCase()).join(" and ")} first.`); return; }
    // Only send what's on screen; anything else on the file is kept as is.
    const sent = Object.fromEntries(Object.entries(v).filter(([k]) => shownKeys.has(k.replace(/_na$/, ""))));
    start(async () => {
      const r = fileId ? await updateFile({ id: fileId, statusId: status, answers: sent }) : await startFile({ personId, kind, statusId: status, answers: sent });
      if (!r.ok) { setError(r.error); return; }
      const st = statuses.find((s) => s.id === status)?.name ?? "";
      onSaved(fileId ? "Saved." : `${kind === "buyer" ? "Buyer" : "Seller"} started at ${st}.`);
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
          <fieldset key={g.id} className="rounded-lg border border-misty px-3 pt-1 pb-3">
            <legend className="px-1 text-sm font-bold">{g.name}</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {g.fields.map((q) => <Field key={q.key} q={q} v={v} set={(k, x) => setV((o) => ({ ...o, [k]: x }))} />)}
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

function Field({ q, v, set }: { q: PaField; v: Answers; set: (k: string, x: string) => void }) {
  const [focus, setFocus] = useState(false);
  const label = `${q.label}${q.required ? " *" : ""}`;
  const value = v[q.key] ?? "";
  if (q.type === "choice" || q.type === "yesno") {
    const opts = q.type === "yesno" ? ["No", "Yes"] : q.options ?? [];
    return (
      <label className="label">{label}
        <select className="input" value={value} onChange={(e) => set(q.key, e.target.value)}>
          {!opts.includes(value) && <option value="">—</option>}
          {opts.map((o) => <option key={o}>{o}</option>)}
        </select>
      </label>
    );
  }
  if (q.type === "date-na") {
    const na = v[`${q.key}_na`] === "yes";
    return (
      <div className="label">{label}
        <span className="flex items-center gap-2">
          <input aria-label={q.label} type="date" className="input" value={na ? "" : value} disabled={na} onChange={(e) => set(q.key, e.target.value)} />
          <label className="flex items-center gap-1 text-sm font-normal text-charcoal"><input type="checkbox" checked={na} onChange={(e) => set(`${q.key}_na`, e.target.checked ? "yes" : "")} /> N/A</label>
        </span>
      </div>
    );
  }
  if (q.key === "address") return <div className="label">{label}<AddressInput label={q.label} value={value} onChange={(x) => set(q.key, x)} placeholder={q.hint ?? "Street, city"} /></div>;
  if (q.type === "moneypct") return <div className="label">{label}<MoneyOrPctInput label={q.label} value={value} onChange={(x) => set(q.key, x)} /></div>;
  if (q.type === "datetime") return <div className="label">{label}<DateTimeInput label={q.label} value={value} onChange={(x) => set(q.key, x)} /></div>;
  return (
    <label className="label">{label}
      <input className="input" value={q.type === "money" ? moneyTyped(value) : q.type === "pct" && !focus ? pctShown(value) : value} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} onChange={(e) => set(q.key, q.type === "money" ? moneyTyped(e.target.value) : e.target.value)} placeholder={q.hint ?? (q.type === "money" ? "$" : q.type === "pct" ? "e.g. 2.7" : "")}
        type={q.type === "date" ? "date" : "text"} inputMode={["money", "number", "pct"].includes(q.type) ? "decimal" : undefined} />
    </label>
  );
}
