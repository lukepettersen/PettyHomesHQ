"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Modal } from "@/components/Modal";
import { useDropdown } from "@/components/useDropdown";
import { addMinutes, APPT_TYPES, defaultTitle, type ApptType, type ApptView } from "@/lib/appointments";
import { addDays, diffDays, formatTime, longIso } from "@/lib/tasks";
import { initials } from "@/lib/normalize";
import type { StatusRow } from "@/server/files";
import type { FileSection } from "@/lib/files";
import { bookAppointment, deleteAppointment, updateAppointment } from "../apptActions";
import { TimeSelect } from "@/components/TimeSelect";
import { FileForm } from "../../pipeline/FileForm";

type Props = {
  fileForms: Record<"buyer" | "listing", FileSection[]>; personId: string; personName: string; appts: ApptView[]; today: string; phone: string; address: string; hasEmail: boolean; team: string[];
  callTemplates: { name: string; steps: number; trigger: string }[]; calendarConnected: boolean; activeKinds: string[]; statuses: Record<"buyer" | "listing", StatusRow[]>; canSeeCommission: boolean;
};

/** Contact page → Appointments: upcoming, then "Past appointments (N)"; + to book (SPEC.md §10). */
export function AppointmentsCard(p: Props) {
  const router = useRouter();
  const { open: menuOpen, setOpen: setMenuOpen, ref: menuRef } = useDropdown<HTMLDivElement>();
  const [booking, setBooking] = useState<ApptType | null>(null);
  const [editing, setEditing] = useState<ApptView | null>(null);
  const [startFile, setStartFile] = useState<{ kind: "buyer" | "listing"; consult: string } | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [msg, setMsg] = useState("");
  const up = p.appts.filter((a) => a.date >= p.today), past = p.appts.filter((a) => a.date < p.today).reverse();
  return (
    <section className="card p-4" aria-labelledby="appt-h">
      <div ref={menuRef} className="relative flex items-center justify-between">
        <h3 id="appt-h" className="font-bold">Appointments <span className="text-sm font-normal muted">{up.length || ""}</span></h3>
        <button type="button" className="link text-sm" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>+ Book</button>
        {menuOpen && (
          <div className="absolute right-0 top-full z-20 mt-1 flex w-60 flex-col rounded-lg border border-misty bg-white p-1.5 shadow-xl">
            {APPT_TYPES.map(([k, l]) => (
              <button key={k} type="button" className="rounded-md px-2.5 py-2 text-left text-sm hover:bg-sunken" onClick={() => { setMenuOpen(false); setBooking(k); }}>
                {k === "other" ? "+ Other appointment" : `Book ${l.toLowerCase()}`}
              </button>
            ))}
          </div>
        )}
      </div>
      <ul className="mt-2 flex flex-col gap-2">{up.map((a, i) => <Appt key={a.id ?? `c${i}`} a={a} today={p.today} personName={p.personName} onEdit={() => setEditing(a)} onDeleted={() => router.refresh()} />)}</ul>
      {up.length === 0 && <p className="mt-1 text-sm muted">Nothing scheduled. Contract dates show up here once a purchase agreement is added.</p>}
      {p.appts.some((a) => a.fromContract) && <p className="mt-2 text-xs muted">&quot;From contract&quot; items come from the purchase agreement&apos;s inspection appointment and key dates. Change them there.</p>}
      {past.length > 0 && <button type="button" className="link mt-2 text-sm" aria-expanded={showPast} onClick={() => setShowPast(!showPast)}>{showPast ? "Hide past appointments" : `Past appointments (${past.length})`}</button>}
      {showPast && <ul className="mt-2 flex flex-col gap-2 opacity-80">{past.map((a, i) => <Appt key={a.id ?? `p${i}`} a={a} today={p.today} personName={p.personName} onEdit={() => setEditing(a)} onDeleted={() => router.refresh()} />)}</ul>}
      {msg && <p role="status" className="mt-2 text-sm text-accent">{msg}</p>}
      {booking && <BookModal {...p} type={booking} onClose={() => setBooking(null)} onBooked={(m, file) => { setBooking(null); setMsg(m); router.refresh(); if (file) setStartFile(file); }} />}
      {editing && <BookModal {...p} type={(editing.type as ApptType) ?? "other"} edit={editing} onClose={() => setEditing(null)} onBooked={(m) => { setEditing(null); setMsg(m); router.refresh(); }} />}
      {startFile && (
        <FileForm form={p.fileForms[startFile.kind]} kind={startFile.kind} personId={p.personId} personName={p.personName} statuses={p.statuses[startFile.kind]} answers={{ consult: startFile.consult }} canSeeCommission={p.canSeeCommission}
          onClose={() => setStartFile(null)} onSaved={(m) => { setStartFile(null); setMsg(m); router.refresh(); }} />
      )}
    </section>
  );
}

function Appt({ a, today, personName, onEdit, onDeleted }: { a: ApptView; today: string; personName: string; onEdit: () => void; onDeleted: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const n = diffDays(a.date, today);
  const day = n === 0 ? "Today" : n === 1 ? "Tomorrow" : n > 1 && n < 7 ? ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date(`${a.date}T12:00:00Z`).getUTCDay()] : longIso(a.date);
  const time = a.start ? `${formatTime(a.start)}${a.end ? `–${formatTime(a.end)}` : ""} ` : "";
  return (
    <li className="rounded-md border border-misty/70 px-2.5 py-2 text-sm">
      <b className="block">{a.title}</b>
      <span className={`block text-xs ${n === 0 ? "font-semibold text-accent" : "muted"}`}>{time}{day}</span>
      {a.location && <span className="block text-xs muted">{a.location}</span>}
      <span className="mt-1 flex items-center justify-between gap-2">
        <span className="flex gap-1">{a.invitees.map((x) => <span key={x} title={x} className="grid h-5 w-5 place-items-center rounded-full bg-accent-soft text-[9px] font-bold text-accent">{initials(x)}</span>)}</span>
        {a.fromContract ? <span className="text-xs muted" title="Change it on the purchase agreement (Edit, or the date tiles)">From contract</span> : (
          <span className="flex gap-3">
          <button type="button" className="text-xs font-semibold text-accent hover:underline" aria-label={`Edit ${a.title}`} onClick={onEdit}>Edit</button>
          <button type="button" className="text-xs font-semibold text-bad hover:underline" disabled={pending} aria-label={confirm ? undefined : `Delete ${a.title}`} onBlur={() => setConfirm(false)}
            onClick={() => { if (!confirm) { setConfirm(true); return; } start(async () => { const r = await deleteAppointment(a.id!); if (r.ok) onDeleted(); }); }}>{confirm ? "Click again to delete" : "Delete"}</button>
          </span>
        )}
      </span>
      <span className="sr-only">for {personName}</span>
    </li>
  );
}

function BookModal({ type, personId, personName, today, phone, address, hasEmail, team, callTemplates, activeKinds, calendarConnected, onClose, onBooked, edit }: Props & { type: ApptType; edit?: ApptView; onClose: () => void; onBooked: (m: string, file?: { kind: "buyer" | "listing"; consult: string }) => void }) {
  const [, label, mins] = APPT_TYPES.find(([k]) => k === type)!;
  const client = personName.split("&")[0].trim();
  const [f, setF] = useState(edit
    ? { title: edit.title, date: edit.date, start: edit.start ?? "", end: edit.end ?? "", location: edit.location, invitees: edit.invitees }
    : { title: defaultTitle(personName, type), date: addDays(today, 1), start: "12:00", end: addMinutes("12:00", mins), location: type === "call" ? phone : type === "seller" ? address : "", invitees: [client, ...team] });
  const fileKind = type === "buyer" ? "buyer" : type === "seller" ? "listing" : null;
  const offerFile = !edit && !!fileKind && !activeKinds.includes(fileKind);
  const [thenFile, setThenFile] = useState(offerFile);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const starts = callTemplates.filter((t) => t.trigger === (type === "call" ? "phonecall" : `${type}consult`));
  const steps = starts.reduce((n, t) => n + t.steps, 0);
  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    start(async () => {
      if (edit) {
        const u = await updateAppointment({ id: edit.id!, title: f.title, date: f.date, start: f.start || null, end: f.end || null, location: f.location, invitees: f.invitees });
        if (!u.ok) { setError(u.error); return; }
        onBooked(type === "call" ? "Saved. Steps timed from the call moved with it." : "Saved.");
        return;
      }
      const r = await bookAppointment({ personId, type, title: f.title, date: f.date, start: f.start || null, end: f.end || null, location: f.location, invitees: f.invitees });
      if (!r.ok) { setError(r.error); return; }
      const tasks = r.data!.tasks;
      const started = tasks ? ` ${tasks} task${tasks === 1 ? "" : "s"} started.` : "";
      onBooked(`${type === "call" ? "Call" : "Appointment"} booked.${started}`, thenFile && fileKind ? { kind: fileKind, consult: f.date } : undefined);
    });
  };
  return (
    <Modal title={edit ? "Edit appointment" : type === "other" ? "Create appointment" : `Book ${label.toLowerCase()}`} onClose={onClose}>
      <form onSubmit={submit} autoComplete="off" className="flex flex-col gap-3">
        <label className="label">Title<input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></label>
        <div className="grid grid-cols-3 gap-2">
          <label className="label">Date<input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required /></label>
          <div className="label">Start<TimeSelect label="Start" allowNone value={f.start} onChange={(x) => setF({ ...f, start: x, end: x ? addMinutes(x, mins) : f.end })} /></div>
          <div className="label">End<TimeSelect label="End" allowNone value={f.end} onChange={(x) => setF({ ...f, end: x })} /></div>
        </div>
        <label className="label">{type === "call" ? "Phone number" : type === "showing" ? "Property address" : "Location"}
          <input className="input" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
        </label>
        <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <legend className="mb-1 text-xs font-semibold muted">Invite</legend>
          {[client, ...team].map((n) => (
            <label key={n} className="flex items-center gap-1.5">
              <input type="checkbox" checked={f.invitees.includes(n)} onChange={(e) => setF({ ...f, invitees: e.target.checked ? [...f.invitees, n] : f.invitees.filter((x) => x !== n) })} /> {n}
            </label>
          ))}
        </fieldset>
        <p className="text-xs muted">{calendarConnected ? "Adds it to Google Calendar and sends the invites." : "Saved in HQ only. Connect Google Calendar in Admin → Integrations to add appointments to the calendar."}{calendarConnected && !hasEmail && ` There's no email on file for ${client}, so only the team gets the invite.`}</p>
        {type === "call" && !edit && <p className="text-xs muted">{starts.length ? `Starts ${starts.map((t) => `"${t.name}"`).join(" + ")}: ${steps} tasks timed from today and the call.` : "No template starts when a call is booked. Add one in Admin → Task templates."}</p>}
        {(type === "buyer" || type === "seller") && !edit && starts.length > 0 && <p className="text-xs muted">Starts {starts.map((t) => `"${t.name}"`).join(" + ")}: {steps} task{steps === 1 ? "" : "s"} timed from today and the consult.</p>}
        {offerFile && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={thenFile} onChange={(e) => setThenFile(e.target.checked)} /> Also start a {fileKind === "buyer" ? "buyer" : "listing"} at Consult scheduled (opens next)</label>}
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={pending}>{edit ? "Save changes" : type === "other" ? "Create appointment" : `Book ${label.toLowerCase()}`}</button>
        </div>
      </form>
    </Modal>
  );
}
