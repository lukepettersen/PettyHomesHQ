"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { SaveBar } from "@/components/SaveBar";
import { TimeSelect } from "@/components/TimeSelect";
import { fillTitle, ruleHours, type DateOption, type InviteRule } from "@/lib/contractInvites";
import { saveInviteRules } from "./actions";
import { refreshCalendar } from "../integrations/actions";

const SAMPLE = { personName: "Sam & Lena Ortiz", address: "2215 Hillside Ave, Edina" };
const clock = (t: string) => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`; };

/** Admin → Calendar invites: one card per contract date that goes on the calendar (SPEC.md §12). */
export function CalendarInvitesClient({ rules: initial, options, fields, connected }: { rules: InviteRule[]; options: DateOption[]; fields: [string, string][]; connected: boolean }) {
  const router = useRouter();
  const [rules, setRules] = useState(initial);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const titles = useRef<Record<string, HTMLInputElement | null>>({});
  const dirty = JSON.stringify(rules) !== JSON.stringify(initial);
  const opt = (key: string) => options.find((o) => o.key === key);
  const patch = (id: string, p: Partial<InviteRule>) => { setNote(""); setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r))); };
  const insert = (id: string, key: string) => {
    const el = titles.current[id], r = rules.find((x) => x.id === id)!, tag = `{${key}}`;
    const at = el?.selectionStart ?? r.title.length;
    patch(id, { title: r.title.slice(0, at) + tag + r.title.slice(el?.selectionEnd ?? at) });
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + tag.length, at + tag.length); });
  };
  const add = () => {
    let n = rules.length + 1;
    while (rules.some((x) => x.id === `r${n}`)) n++;
    const id = `r${n}`;
    setRules((rs) => [...rs, { id, on: true, date: options[0]?.key ?? "closing", title: "{last_name} - ", time: "", side: "both", team: true, client: true }]);
    requestAnimationFrame(() => titles.current[id]?.focus());
  };
  const when = (r: InviteRule) => { const h = ruleHours(r); const len = `${h} hour${h === 1 ? "" : "s"}`; return r.time === "form" ? `at the time entered on the form (${len})` : r.time ? `at ${clock(r.time)} (${len})` : "all day"; };

  return (
    <div className="flex flex-col gap-3 pb-20">
      {rules.map((r) => {
        const o = opt(r.date);
        return (
          <section key={r.id} className={`card flex flex-col gap-3 p-4 ${r.on ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={r.on} onChange={(e) => patch(r.id, { on: e.target.checked })} /> On</label>
              <span className="min-w-0 flex-1 truncate text-sm muted">Example: <b className="text-charcoal">{fillTitle(r.title, SAMPLE) || "(no title)"}</b> · {when(r)}</span>
              <button type="button" className="text-xs font-semibold text-bad hover:underline" onBlur={() => setConfirmDel(null)}
                onClick={() => { if (confirmDel !== r.id) { setConfirmDel(r.id); return; } setConfirmDel(null); setRules((rs) => rs.filter((x) => x.id !== r.id)); }}>
                {confirmDel === r.id ? "Click again to remove" : "Remove"}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
              <label className="label">Title
                <input ref={(el) => { titles.current[r.id] = el; }} className="input" value={r.title} onChange={(e) => patch(r.id, { title: e.target.value })} />
              </label>
              <label className="label">Date from the purchase agreement
                <select className="input" value={r.date} onChange={(e) => patch(r.id, { date: e.target.value, time: r.time === "form" && !opt(e.target.value)?.withTime ? "" : r.time })}>
                  {!o && <option value={r.date}>(question removed from the form)</option>}
                  {options.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs muted">Insert:</span>
              {fields.map(([k, l]) => <button key={k} type="button" className="chip hover:bg-misty" title={`{${k}}`} onClick={() => insert(r.id, k)}>{l}</button>)}
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <label className="flex items-center gap-2">Time
                <select className="input w-auto" value={r.time === "form" ? "form" : r.time ? "set" : ""} onChange={(e) => patch(r.id, { time: e.target.value === "form" ? "form" : e.target.value === "set" ? "09:00" : "" })}>
                  <option value="">All day</option>
                  {o?.withTime && <option value="form">Time on the form</option>}
                  <option value="set">Set time</option>
                </select>
                {r.time && r.time !== "form" && <TimeSelect label="Event time" value={r.time} onChange={(v) => patch(r.id, { time: v })} className="input w-auto" />}
              </label>
              {r.time && (
                <label className="flex items-center gap-2">Length
                  <select className="input w-auto" value={ruleHours(r)} onChange={(e) => patch(r.id, { hours: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((h) => <option key={h} value={h}>{h} hour{h === 1 ? "" : "s"}</option>)}
                  </select>
                </label>
              )}
              <label className="flex items-center gap-2">Deals
                <select className="input w-auto" value={r.side} onChange={(e) => patch(r.id, { side: e.target.value as InviteRule["side"] })}>
                  <option value="both">Buyer and seller</option><option value="buyer">Buyer side only</option><option value="seller">Seller side only</option>
                </select>
              </label>
              <span className="flex items-center gap-3">Invite
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={r.team} onChange={(e) => patch(r.id, { team: e.target.checked })} /> Team (Luke &amp; Alyssa)</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={r.client} onChange={(e) => patch(r.id, { client: e.target.checked })} /> Client</label>
              </span>
            </div>
          </section>
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn" onClick={add}>+ Add calendar invite</button>
        <span className="text-xs muted">Need a date that isn&apos;t listed (like sewer scope or earnest money due)? Add it as a Date or Date and time question in Admin → Deal questions → Purchase agreement, and it shows up here.</span>
      </div>
      {connected && !dirty && (
        <div className="card flex flex-wrap items-center gap-3 p-4 text-sm">
          <span className="flex-1">New and changed contracts use these settings right away. To update the deals already under contract, refresh their invites.</span>
          <button type="button" className="btn" disabled={pending} onClick={() => start(async () => { setError(""); const r = await refreshCalendar(); if (!r.ok) setError(r.error); else setNote(`Updated ${r.data!.count} active contract${r.data!.count === 1 ? "" : "s"}.`); })}>Refresh calendar invites</button>
        </div>
      )}
      {note && <p role="status" className="text-sm text-accent">{note}</p>}
      <SaveBar dirty={dirty} pending={pending} error={error}
        onDiscard={() => { setRules(initial); setError(""); }}
        onSave={() => start(async () => { setError(""); const r = await saveInviteRules(rules); if (!r.ok) { setError(r.error); return; } setNote("Saved."); router.refresh(); })} />
    </div>
  );
}
