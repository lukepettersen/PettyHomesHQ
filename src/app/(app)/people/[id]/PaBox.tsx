"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { applicableDates, commissionLine, effectiveStatus, isPending, KEY_DATES, visibleSections, type DateKey, type PaSection, type PaView, type Side } from "@/lib/pa";
import { money, moneyOrPctShown, shortDay } from "@/lib/files";
import { diffDays } from "@/lib/tasks";
import { CallLink } from "@/components/CallCenter";
import { fellThrough, markClosed, markPending } from "../../pipeline/paActions";

// The deal box pieces for a contract (SPEC.md §7.4, layout owner-approved 2026-10-28): buttons, key-date timeline,
// Notes facts and People. FileTabs lays them out.

const CORE = new Set(["address", "price", "em", "emTo", "sc", "fin", "commission", "bac", "ptype", "year", "hoa", "newc", ...KEY_DATES.map(([k]) => k)]);
const keyLabel = (k: DateKey) => KEY_DATES.find(([x]) => x === k)![1];
const inDays = (d: string, today: string) => { const n = diffDays(d, today); return n === 0 ? "Today" : n === 1 ? "Tomorrow" : n > 0 ? `In ${n} days` : `${-n} days ago`; };

/** The next key date that isn't met or waived, for "Next: Inspection deadline Mon Nov 2 (in 5 days)". */
export function nextKeyDate(pa: PaView, today: string): { label: string; date: string; when: string } | null {
  const k = applicableDates(pa).find((x) => pa.dates[x] && !["met", "waived"].includes(effectiveStatus(pa.dates[x], pa.dateStatus[x], today)));
  return k ? { label: keyLabel(k), date: pa.dates[k]!, when: inDays(pa.dates[k]!, today).toLowerCase() } : null;
}

/** Mark pending, then (once pending) Mark closed, and Fell through: each two clicks. */
export function PaButtons({ pa, personName, pendingAt, today, onMsg, onError }: { pa: PaView; personName: string; pendingAt: DateKey[]; today: string; onMsg: (m: string) => void; onError: (m: string) => void }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<"" | "close" | "fell" | "pending">("");
  const [busy, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) => start(async () => {
    onError(""); const r = await fn();
    if (!r.ok) { onError(r.error ?? "Something went wrong."); return; }
    onMsg(done); setConfirm(""); router.refresh();
  });
  const pend = isPending(pa, pendingAt, today);
  return (
    <>
      {pend
        ? <button type="button" className="btn btn-primary" disabled={busy} onBlur={() => setConfirm("")} onClick={() => confirm === "close" ? run(() => markClosed(pa.id), `Closed. ${personName} is now a Past Client.`) : setConfirm("close")}>{confirm === "close" ? "Click again to close" : "Mark closed"}</button>
        : <button type="button" className="btn btn-primary" disabled={busy} onBlur={() => setConfirm("")} onClick={() => confirm === "pending" ? run(() => markPending(pa.id), "Pending. The inspection deadline is marked met.") : setConfirm("pending")}>{confirm === "pending" ? "Click again: pending" : "Mark pending"}</button>}
      <button type="button" className="btn" disabled={busy} onBlur={() => setConfirm("")} onClick={() => confirm === "fell" ? run(() => fellThrough(pa.id), "Marked as fell through. The file is back at its status.") : setConfirm("fell")}>{confirm === "fell" ? "Click again: fell through" : "Fell through"}</button>
    </>
  );
}

/** Key dates as a timeline: met ones checked, the next one highlighted, countdowns. Dates change with Edit contract. */
export function DateStrip({ pa, today }: { pa: PaView; today: string }) {
  const keys = applicableDates(pa);
  const next = keys.find((k) => pa.dates[k] && !["met", "waived"].includes(effectiveStatus(pa.dates[k], pa.dateStatus[k], today)));
  const doneCount = keys.filter((k) => ["met", "waived"].includes(effectiveStatus(pa.dates[k], pa.dateStatus[k], today))).length;
  return (
    <ol className="relative isolate mt-5 grid gap-y-4 max-sm:grid-cols-2" style={{ gridTemplateColumns: `repeat(${keys.length}, minmax(0, 1fr))` }}>
      <li aria-hidden="true" className="absolute top-[11px] h-[3px] bg-misty max-sm:hidden" style={{ left: `${50 / keys.length}%`, right: `${50 / keys.length}%` }} />
      <li aria-hidden="true" className="absolute top-[11px] h-[3px] bg-moss max-sm:hidden" style={{ left: `${50 / keys.length}%`, width: `${(Math.max(0, Math.min(doneCount, keys.length - 1)) / keys.length) * 100}%` }} />
      {keys.map((k) => {
        const d = pa.dates[k];
        const st = effectiveStatus(d, pa.dateStatus[k], today);
        const done = st === "met" || st === "waived";
        const isNext = k === next;
        return (
          <li key={k} className="relative px-1 text-center">
            <span aria-hidden="true" className={`relative z-[1] mx-auto grid h-6 w-6 place-items-center rounded-full border-[3px] text-[11px] font-extrabold text-white ${done ? "border-moss bg-moss" : isNext ? "border-coral bg-white shadow-[0_0_0_4px_rgba(204,120,85,0.18)]" : "border-misty bg-white"}`}>{done ? "✓" : ""}</span>
            <span className="mt-1.5 block text-[11px] font-bold uppercase tracking-wide muted">{keyLabel(k)}</span>
            <b className="block">{d ? shortDay(d) : "Not set"}</b>
            <span className={`block text-xs ${done ? "font-semibold text-accent" : isNext ? "font-semibold text-[#9a4f2e]" : "muted"}`}>
              {st === "waived" ? "Waived" : done ? "Met" : d ? `${st === "extended" ? "Extended · " : ""}${inDays(d, today)}` : ""}
            </span>
            {pa.originalDates[k] && <span className="block text-[11px] muted">was {shortDay(pa.originalDates[k]!)}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** The contract's facts for the Notes box (owner calls it Notes, 2026-10-28). */
export function paFacts(pa: PaView, forms: Record<Side, PaSection[]>): [string, string][] {
  const a = pa.answers;
  const sections = visibleSections(forms[pa.side], { ...a });
  const extras = sections.filter((s) => !s.people).flatMap((s) => s.fields).filter((f) => !CORE.has(f.key) && a[f.key])
    .map((f): [string, string] => [f.label, f.type === "datetime" ? fmtDateTime(a[f.key]) : f.type === "date" ? shortDay(a[f.key]) : a[f.key]]);
  return ([
    ["Price", money(pa.price)], ["Earnest money", a.em ? `${money(+a.em)}${a.emTo ? ` · to ${a.emTo}` : ""}` : ""], ["Seller contributions", a.sc ? moneyOrPctShown(a.sc) : ""],
    ["Commission", pa.commission ? commissionLine(pa.commission, pa.price) : ""], ["BAC", pa.bac ? money(+pa.bac) : ""], ["Financing", a.fin ?? ""],
    ["Property", [a.ptype, a.year && `built ${a.year}`, a.hoa === "Yes" && "HOA", a.newc === "Yes" && "New construction"].filter(Boolean).join(" · ")],
    ...extras,
  ] as [string, string][]).filter(([, x]) => x);
}

export type DealPerson = { role: string; name: string; company: string; email: string; phone: string; other: string };
const isEmail = (s: string) => /\S+@\S+\.\S+/.test(s);
const isPhone = (s: string) => s.replace(/\D/g, "").length >= 10 && !/[a-z]/i.test(s);

/** Lender, title and agents with their email and phone (from the contact picked, else what was typed on the contract). */
export function paPeople(pa: PaView, forms: Record<Side, PaSection[]>): DealPerson[] {
  const a = pa.answers;
  return visibleSections(forms[pa.side], { ...a }).filter((s) => s.people).flatMap((s) => {
    const partner = pa.partners[s.id];
    const vals = s.fields.map((f) => ({ label: f.label.toLowerCase(), v: (a[f.key] ?? "").trim() })).filter((x) => x.v);
    // "Email/phone" fields can hold both, e.g. "jane@title.com 612-555-1234".
    const parts = vals.flatMap((x) => x.label.includes("email") || x.label.includes("phone") ? x.v.split(/[\s,;/]+/).map((v) => ({ label: x.label, v })) : [x]);
    const email = partner?.email ?? parts.find((x) => isEmail(x.v))?.v ?? "";
    const phone = partner?.phone ?? parts.find((x) => isPhone(x.v))?.v ?? "";
    const company = vals.find((x) => x.label.includes("company"))?.v ?? "";
    const named = vals.find((x) => /name|contact|agent/.test(x.label) && !isEmail(x.v) && !isPhone(x.v) && x.v !== company)?.v;
    const name = partner?.name ?? named ?? "";
    const other = vals.filter((x) => ![email, phone, company, name].includes(x.v) && !isEmail(x.v) && !isPhone(x.v) && !x.label.includes("email")).map((x) => x.v).join(" · ");
    return name || company || email || phone ? [{ role: s.name, name: name || company, company: name ? company : "", email, phone, other }] : [];
  });
}

export function PeopleList({ people }: { people: DealPerson[] }) {
  return (
    <ul className="flex flex-col">
      {people.map((p) => (
        <li key={p.role} className="border-t border-misty py-1.5 text-sm first:border-0 first:pt-0">
          <b>{p.name}</b> <span className="text-xs muted">{[p.role, p.company, p.other].filter(Boolean).join(" · ")}</span>
          {(p.email || p.phone) && (
            <span className="block break-words text-[13px]">
              {p.email && <a className="link" href={`mailto:${p.email}`}>{p.email}</a>}
              {p.email && p.phone && <span className="muted"> · </span>}
              {p.phone && <CallLink className="link" number={p.phone} name={p.name}>{p.phone}</CallLink>}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Label/value pairs, three across (two on a phone). */
export function FactGrid({ facts }: { facts: [string, string][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
      {facts.map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-xs muted">{k}</dt><dd className="break-words text-sm font-semibold">{v}</dd></div>)}
    </dl>
  );
}

function fmtDateTime(v: string) {
  const [d, t] = v.split("T");
  const [h, m] = t.split(":").map(Number);
  return `${shortDay(d)} ${h % 12 || 12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}
