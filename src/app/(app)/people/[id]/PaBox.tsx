"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { applicableDates, commissionLine, effectiveStatus, KEY_DATES, visibleSections, type DateKey, type PaSection, type PaView, type Side } from "@/lib/pa";
import { money, shortDay } from "@/lib/files";
import { fellThrough, markClosed, setKeyDate } from "../../pipeline/paActions";
import { PaWizard } from "../../pipeline/PaWizard";

const STATUS_STYLE: Record<string, string> = { met: "bg-accent-soft text-accent", waived: "bg-[#ebe8f2] text-[#6b6480]", extended: "bg-[#fbefd6] text-[#9a6400]", pending: "bg-sunken text-muted" };
const CORE = new Set(["address", "price", "em", "sc", "fin", "commission", "bac", "ptype", "year", "hoa", "newc", ...KEY_DATES.map(([k]) => k)]);

/** The contract on a file: key-date tiles, facts, people, Edit · Fell through · Mark closed (SPEC.md §7.4). */
export function PaBox({ pa, personName, fileKind, fileLine, forms, today, canSeeCommission, children }: { children?: React.ReactNode; pa: PaView; personName: string; fileKind: "buyer" | "listing"; fileLine: string; forms: Record<Side, PaSection[]>; today: string; canSeeCommission: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<"" | "close" | "fell">("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) => start(async () => {
    setError(""); const r = await fn();
    if (!r.ok) { setError(r.error ?? "Something went wrong."); return; }
    setMsg(done); setConfirm(""); router.refresh();
  });
  const a = pa.answers;
  const form = forms[pa.side];
  const facts: [string, string][] = [
    ["Price", money(pa.price)], ["Earnest money", a.em ? money(+a.em) : ""], ["Seller contributions", a.sc ? money(+a.sc) : ""],
    ["Commission", pa.commission ? commissionLine(pa.commission, pa.price) : ""], ["BAC", pa.bac ? money(+pa.bac) : ""], ["Financing", a.fin ?? ""],
    ["Property", [a.ptype, a.year && `built ${a.year}`, a.hoa === "Yes" && "HOA", a.newc === "Yes" && "New construction"].filter(Boolean).join(" · ")],
  ];
  const sections = visibleSections(form, { ...a });
  const extras = sections.filter((s) => !s.people).flatMap((s) => s.fields).filter((f) => !CORE.has(f.key) && a[f.key])
    .map((f): [string, string] => [f.label, f.type === "datetime" ? fmtDateTime(a[f.key]) : f.type === "date" ? shortDay(a[f.key]) : a[f.key]]);
  const people = sections.filter((s) => s.people).map((s): [string, string] => [s.name, s.fields.map((f) => a[f.key]).filter(Boolean).join(" · ")]).filter(([, x]) => x);

  return (
    <div className="mt-4 rounded-lg border border-misty bg-paper p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <span className={`rounded px-1.5 text-[11px] font-bold uppercase tracking-wide ${pa.side === "buyer" ? "bg-accent-soft text-accent" : "bg-[#f6e3d9] text-[#9a4f2e]"}`}>{pa.side === "buyer" ? "Buyer side" : "Seller side"}</span>{" "}
          <b>Purchase agreement</b> · {pa.address} <span className="muted">{money(pa.price)}</span>
          <p className="text-xs muted">{pa.dates.closing ? `Closing ${shortDay(pa.dates.closing)}` : "Closing date not set"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => setEditing(true)}>Edit</button>
          <button type="button" className="btn" disabled={pending} onBlur={() => setConfirm("")} onClick={() => confirm === "fell" ? run(() => fellThrough(pa.id), "Marked as fell through. The file is back at its status.") : setConfirm("fell")}>{confirm === "fell" ? "Click again: fell through" : "Fell through"}</button>
          <button type="button" className="btn btn-primary" disabled={pending} onBlur={() => setConfirm("")} onClick={() => confirm === "close" ? run(() => markClosed(pa.id), `Closed. ${personName} is now a Past Client.`) : setConfirm("close")}>{confirm === "close" ? "Click again to close" : "Mark closed"}</button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {applicableDates(pa).map((k) => <DateTile key={k} pa={pa} k={k} today={today} onDone={(m) => { setMsg(m); router.refresh(); }} onError={setError} />)}
      </div>
      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        {[...facts, ...extras].filter(([, x]) => x).map(([k, x]) => <div key={k} className="flex gap-1.5"><dt className="muted">{k}</dt><dd className="font-semibold">{x}</dd></div>)}
      </dl>
      {people.length > 0 && (
        <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
          {people.map(([k, x]) => <div key={k} className="flex gap-1.5"><dt className="muted">{k}</dt><dd>{x}</dd></div>)}
        </dl>
      )}
      {children}
      {msg && <p role="status" className="mt-2 text-sm text-accent">{msg}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
      {editing && <PaWizard fileId={pa.fileId} fileKind={fileKind} personName={personName} fileLine={fileLine} pa={pa} forms={forms} canSeeCommission={canSeeCommission}
        onClose={() => setEditing(false)} onSaved={(m) => { setEditing(false); setMsg(m); router.refresh(); }} />}
    </div>
  );
}

function fmtDateTime(v: string) {
  const [d, t] = v.split("T");
  const [h, m] = t.split(":").map(Number);
  return `${shortDay(d)} ${h % 12 || 12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}

/** One key date: Not set / + Add date, or the date with Met · Waived · Extended · Pending. */
function DateTile({ pa, k, today, onDone, onError }: { pa: PaView; k: DateKey; today: string; onDone: (m: string) => void; onError: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(pa.dates[k] ?? "");
  const [pending, start] = useTransition();
  const label = KEY_DATES.find(([x]) => x === k)![1];
  const d = pa.dates[k];
  const st = effectiveStatus(d, pa.dateStatus[k], today);
  const auto = st === "met" && pa.dateStatus[k] !== "met";
  const set = (status: string, newDate?: string) => start(async () => {
    const r = await setKeyDate({ id: pa.id, key: k, status: status as never, date: newDate || undefined });
    if (!r.ok) { onError(r.error); return; }
    setOpen(false); onDone(`${label}: ${status === "pending" && !d ? "date added" : status}.`);
  });
  return (
    <div className="relative rounded-md border border-misty bg-white px-2.5 py-2 text-sm">
      <div className="text-xs font-semibold muted">{label}</div>
      {d ? (
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full flex-wrap items-center justify-between gap-1 text-left">
          <b>{shortDay(d)}</b>
          <span className={`rounded-full px-2 text-[11px] font-semibold capitalize ${STATUS_STYLE[st]}`} title={auto ? "The date has passed" : undefined}>{st}</span>
        </button>
      ) : (
        <button type="button" className="link text-sm" onClick={() => setOpen(!open)}>+ Add date</button>
      )}
      {pa.originalDates[k] && <div className="text-[11px] muted">was {shortDay(pa.originalDates[k]!)}</div>}
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 flex w-56 flex-col gap-1.5 rounded-lg border border-misty bg-white p-2 shadow-xl">
          {d && (["met", "waived", "pending"] as const).map((s) => (
            <button key={s} type="button" disabled={pending} className="rounded px-2 py-1 text-left capitalize hover:bg-sunken" onClick={() => set(s)}>{s === "pending" ? "Not met yet" : s}</button>
          ))}
          <label className="flex flex-col gap-1 text-xs font-semibold muted">{d ? "Extend to" : "Date"}
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <span className="flex justify-end gap-1.5">
            <button type="button" className="btn px-2 py-0.5" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn btn-primary px-2 py-0.5" disabled={pending || !date || date === d} onClick={() => set(d ? "extended" : "pending", date)}>{d ? "Extend" : "Save"}</button>
          </span>
        </div>
      )}
    </div>
  );
}
