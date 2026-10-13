"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addTag, deletePerson, removeTag, updateContactInfo, updateDetails, updateImportantDates } from "../actions";
import type { Options } from "@/server/people";
import { daysUntilNext, dateFromIso, firstName, initials, shortDate } from "@/lib/normalize";

type Row = { label: string; value: string };
type Result = { ok: true } | { ok: false; error: string };

/** Card with Edit → Save / Cancel (SPEC.md §5 save rule). */
function useEdit() {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const save = (fn: () => Promise<Result>) => start(async () => {
    setError("");
    const r = await fn();
    if (!r.ok) { setError(r.error); return; }
    setEditing(false); router.refresh();
  });
  return { editing, setEditing, error, setError, pending, save };
}

function CardHead({ title, editing, onEdit }: { title: string; editing: boolean; onEdit: () => void }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="font-bold">{title}</h3>
      {!editing && <button type="button" className="text-sm font-semibold text-accent hover:underline" onClick={onEdit}>Edit</button>}
    </div>
  );
}

function SaveRow({ pending, error, onCancel }: { pending: boolean; error: string; onCancel: () => void }) {
  return (
    <div className="mt-3 flex flex-col gap-2">
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}

function RowsEditor({ rows, setRows, kind, labelPh, valuePh }: { rows: Row[]; setRows: (r: Row[]) => void; kind: string; labelPh: string; valuePh: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[80px_minmax(0,1fr)_24px] items-center gap-1.5">
          <input className="input" value={r.label} placeholder={labelPh} aria-label={`${kind} label`} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
          <input className="input" value={r.value} placeholder={valuePh} aria-label={kind} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
          <button type="button" aria-label={`Remove ${kind}`} className="muted hover:text-bad" onClick={() => setRows(rows.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <button type="button" className="self-start text-sm font-semibold text-accent hover:underline" onClick={() => setRows([...rows, { label: kind === "phone" ? "Mobile" : "", value: "" }])}>+ Add {kind}</button>
    </div>
  );
}

export function InfoCard(p: { id: string; name: string; address: string; phones: Row[]; emails: Row[]; lastContactDays: number | null }) {
  const e = useEdit();
  const [name, setName] = useState(p.name), [address, setAddress] = useState(p.address);
  const [phones, setPhones] = useState(p.phones), [emails, setEmails] = useState(p.emails);
  const reset = () => { setName(p.name); setAddress(p.address); setPhones(p.phones); setEmails(p.emails); e.setError(""); e.setEditing(false); };
  if (e.editing) return (
    <form className="card p-4" onSubmit={(ev) => { ev.preventDefault(); e.save(() => updateContactInfo({ id: p.id, name, address, phones, emails })); }}>
      <CardHead title="Contact info" editing onEdit={() => {}} />
      <div className="flex flex-col gap-3">
        <label className="label">Name<input className="input" value={name} onChange={(x) => setName(x.target.value)} /></label>
        <div className="label">Phones<RowsEditor rows={phones} setRows={setPhones} kind="phone" labelPh="Label" valuePh="Phone" /></div>
        <div className="label">Emails<RowsEditor rows={emails} setRows={setEmails} kind="email" labelPh="Label" valuePh="Email" /></div>
        <label className="label">Address<input className="input" value={address} onChange={(x) => setAddress(x.target.value)} placeholder="Street, city" /></label>
      </div>
      <SaveRow pending={e.pending} error={e.error} onCancel={reset} />
    </form>
  );
  const last = p.lastContactDays;
  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent-soft font-extrabold text-accent">{initials(p.name)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-xl font-extrabold break-words">{p.name}</h1>
            <button type="button" className="text-sm font-semibold text-accent hover:underline" onClick={() => e.setEditing(true)}>Edit</button>
          </div>
          <p className="text-sm muted">{last === null ? "No contact yet" : last === 0 ? "Last contact today" : `Last contact ${last} days ago`}</p>
        </div>
      </div>
      <ul className="mt-3 flex flex-col gap-1.5 text-sm">
        {p.phones.map((x, i) => <li key={`p${i}`}><a className="link" href={`tel:${x.value}`}>{x.value}</a> <span className="muted">({x.label})</span></li>)}
        {p.emails.map((x, i) => <li key={`e${i}`} className="break-all"><a className="link" href={`mailto:${x.value}`}>{x.value}</a>{x.label && <span className="muted"> ({x.label})</span>}</li>)}
        {p.address ? <li>{p.address}</li> : <li><button type="button" className="text-sm muted hover:underline" onClick={() => e.setEditing(true)}>Add address</button></li>}
      </ul>
    </div>
  );
}

export function DetailsCard(p: { id: string; options: Options; stageId: string | null; sourceId: string | null; assignedToId: string | null; followUpDays: number | null; mailingName: string; referredBy: string }) {
  const e = useEdit();
  const o = p.options;
  const name = (list: { id: string; name: string }[], id: string | null) => list.find((x) => x.id === id)?.name;
  if (e.editing) return (
    <form className="card p-4" action={(f) => e.save(() => updateDetails({
      id: p.id, stageId: String(f.get("stageId")), sourceId: String(f.get("sourceId")), assignedToId: String(f.get("assignedToId")),
      followUpDays: f.get("followUpDays") ? Number(f.get("followUpDays")) : null, mailingName: String(f.get("mailingName")), referredBy: String(f.get("referredBy")),
    }))}>
      <CardHead title="Details" editing onEdit={() => {}} />
      <div className="flex flex-col gap-2.5">
        <label className="label">Stage<select className="input" name="stageId" defaultValue={p.stageId ?? ""}><option value="">—</option>{o.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="label">Follow up<select className="input" name="followUpDays" defaultValue={p.followUpDays ?? ""}><option value="">Not set</option>{o.followUp.map((d) => <option key={d} value={d}>Every {d} days</option>)}</select></label>
        <label className="label">Assigned to<select className="input" name="assignedToId" defaultValue={p.assignedToId ?? ""}><option value="">—</option>{o.team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        <label className="label">Source<select className="input" name="sourceId" defaultValue={p.sourceId ?? ""}><option value="">—</option>{o.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="label">Referred by<input className="input" name="referredBy" defaultValue={p.referredBy} /></label>
        <label className="label">Mailing name<input className="input" name="mailingName" defaultValue={p.mailingName} /></label>
      </div>
      <SaveRow pending={e.pending} error={e.error} onCancel={() => { e.setError(""); e.setEditing(false); }} />
    </form>
  );
  const row = (k: string, v: string | null | undefined) => <><dt className="muted">{k}</dt><dd>{v || <span className="muted">Not set</span>}</dd></>;
  return (
    <div className="card p-4">
      <CardHead title="Details" editing={false} onEdit={() => e.setEditing(true)} />
      <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
        {row("Stage", name(o.stages, p.stageId))}
        {row("Follow up", p.followUpDays ? `Every ${p.followUpDays} days` : null)}
        {row("Assigned to", name(o.team, p.assignedToId))}
        {row("Source", name(o.sources, p.sourceId))}
        {p.referredBy && row("Referred by", p.referredBy)}
        {row("Mailing name", p.mailingName)}
      </dl>
    </div>
  );
}

export function TagsCard({ id, tags, allTags }: { id: string; tags: string[]; allTags: string[] }) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<Result>) => start(async () => { setError(""); const r = await fn(); if (!r.ok) setError(r.error); else { setValue(""); router.refresh(); } });
  return (
    <div className="card p-4">
      <h3 className="mb-2 font-bold">Tags</h3>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((t) => (
          <span key={t} className="chip">{t}<button type="button" aria-label={`Remove tag ${t}`} className="muted hover:text-bad" disabled={pending} onClick={() => run(() => removeTag(id, t))}>×</button></span>
        ))}
        {adding ? (
          <form className="flex gap-1.5" onSubmit={(ev) => { ev.preventDefault(); if (!value.trim()) return; run(() => addTag(id, value)); }}>
            <input className="input w-36" list="all-tags" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Tag" aria-label="New tag" autoFocus onKeyDown={(e) => { if (e.key === "Escape") setAdding(false); }} />
            <datalist id="all-tags">{allTags.filter((t) => !tags.includes(t)).map((t) => <option key={t} value={t} />)}</datalist>
            <button className="btn btn-primary" disabled={pending}>Add</button>
          </form>
        ) : (
          <button type="button" aria-label="Add tag" className="grid h-6 w-6 place-items-center rounded-full bg-accent font-bold text-white" onClick={() => setAdding(true)}>+</button>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
    </div>
  );
}

export function DatesCard(p: { id: string; name: string; birthdays: { whose: string; date: string }[]; homeiversary: string }) {
  const e = useEdit();
  const [bdays, setBdays] = useState(p.birthdays), [home, setHome] = useState(p.homeiversary);
  const reset = () => { setBdays(p.birthdays); setHome(p.homeiversary); e.setError(""); e.setEditing(false); };
  const nice = (iso: string, year: boolean) => {
    const d = dateFromIso(iso), n = daysUntilNext(d);
    return <>{shortDate(d, year)} {n <= 30 && <span className="text-xs muted">· {n === 0 ? "today" : `in ${n} day${n === 1 ? "" : "s"}`}</span>}</>;
  };
  if (e.editing) return (
    <form className="card p-4" onSubmit={(ev) => { ev.preventDefault(); e.save(() => updateImportantDates({ id: p.id, birthdays: bdays.filter((b) => b.date), homeiversary: home })); }}>
      <CardHead title="Important Dates" editing onEdit={() => {}} />
      <div className="label">Birthdays
        {bdays.map((b, i) => (
          <div key={i} className="grid grid-cols-[90px_minmax(0,1fr)_24px] items-center gap-1.5">
            <input className="input" value={b.whose} placeholder="Whose" aria-label="Whose birthday" onChange={(x) => setBdays(bdays.map((y, j) => j === i ? { ...y, whose: x.target.value } : y))} />
            <input className="input" type="date" value={b.date} aria-label="Birthday" onChange={(x) => setBdays(bdays.map((y, j) => j === i ? { ...y, date: x.target.value } : y))} />
            <button type="button" aria-label="Remove birthday" className="muted hover:text-bad" onClick={() => setBdays(bdays.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button type="button" className="self-start text-sm font-semibold text-accent hover:underline" onClick={() => setBdays([...bdays, { whose: bdays.length ? "" : firstName(p.name), date: "" }])}>+ Add birthday</button>
      </div>
      <label className="label mt-3">Homeiversary<input className="input" type="date" value={home} onChange={(x) => setHome(x.target.value)} /></label>
      <p className="mt-2 text-xs muted">Pick real dates so HQ can create the birthday and homeiversary tasks. Any year works for birthdays.</p>
      <SaveRow pending={e.pending} error={e.error} onCancel={reset} />
    </form>
  );
  return (
    <div className="card p-4">
      <CardHead title="Important Dates" editing={false} onEdit={() => e.setEditing(true)} />
      <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
        {p.birthdays.length ? p.birthdays.map((b, i) => <div key={i} className="contents"><dt className="muted">{b.whose ? `${b.whose}'s birthday` : "Birthday"}</dt><dd>{nice(b.date, false)}</dd></div>) : <><dt className="muted">Birthdays</dt><dd className="muted">None added</dd></>}
        <dt className="muted">Homeiversary</dt><dd>{p.homeiversary ? nice(p.homeiversary, true) : <span className="muted">Fills in when a deal closes</span>}</dd>
      </dl>
    </div>
  );
}

export function DeletePerson({ id, name }: { id: string; name: string }) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div>
      <button type="button" className="text-sm font-semibold text-bad underline" disabled={pending}
        onClick={() => { if (!confirm) { setConfirm(true); return; } start(async () => { const r = await deletePerson(id); if (!r.ok) setError(r.error); else router.push("/people"); }); }}
        onBlur={() => setConfirm(false)}>
        {confirm ? `Click again to move ${firstName(name)} to Trash` : "Delete person"}
      </button>
      {error && <p role="alert" className="mt-1 text-sm text-bad">{error}</p>}
    </div>
  );
}
