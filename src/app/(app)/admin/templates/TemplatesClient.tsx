"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SaveBar } from "@/components/SaveBar";
import type { StatusRow } from "@/server/files";
import { ANCHORS, CONDS, expand, MINUTE_OPTIONS, newId, STEP_TYPES, TIMED_ANCHORS, triggerLabel, type Phase, type Step, type Template } from "@/lib/templates";
import { longIso } from "@/lib/tasks";
import { deleteTemplate, duplicateTemplate, moveTemplate, saveTemplate } from "./actions";
import { FolderList } from "@/components/FolderList";

type Props = { roles: { id: string; name: string }[]; messages: { id: string; kind: string; name: string; folder: string }[]; templates: Template[]; statuses: StatusRow[]; team: string[]; tags: string[]; stages: string[]; today: string; initialId: string | null };
const blankStep = (): Step => ({ id: newId("s"), name: "New step", assignee: "", type: "task", days: 0, dir: "on", anchor: "start", cond: "always" });

export function TemplatesClient(p: Props) {
  const router = useRouter();
  const [selId, setSelId] = useState<string | null>(p.initialId);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState("");
  const [, start] = useTransition();
  const sel = p.templates.find((t) => t.id === selId) ?? p.templates[0] ?? null;
  const folders = [...new Set(p.templates.map((t) => t.folder ?? "").filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const [folder, setFolder] = useState<string | null>(null); // the folder open in the side panel
  const pick = (id: string) => {
    if (dirty) { setMsg("Save or discard your changes first."); return; }
    setMsg(""); setSelId(id); window.history.replaceState(null, "", `/admin/templates?t=${id}`);
  };
  const create = () => start(async () => {
    if (dirty) { setMsg("Save or discard your changes first."); return; }
    const r = await saveTemplate({ id: null, name: "New template", trigger: null, folder: folder ?? "", phases: [{ id: newId("p"), name: "Steps", steps: [blankStep()] }] });
    if (!r.ok) { setMsg(r.error); return; }
    setSelId(r.data!.id); router.refresh();
  });
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <FolderList items={p.templates.map((t) => { const n = t.phases.reduce((x, ph) => x + ph.steps.length, 0); return { id: t.id, name: t.name, folder: t.folder ?? "", sub: `${triggerLabel(t.trigger, p.statuses)} · ${n} step${n === 1 ? "" : "s"}` }; })}
        selectedId={sel?.id ?? null} onSelect={pick} onFolderChange={setFolder}
        canMove={(id) => (dirty && id === sel?.id ? "Save or discard your changes first." : null)}
        onMove={async (id, f) => { const r = await moveTemplate({ id, folder: f }); if (r.ok) router.refresh(); return r.ok ? { ok: true } : r; }}
        top={<button type="button" className="btn btn-primary" onClick={create}>+ New template</button>} />
      <div className="min-w-0">
        {msg && <p role="alert" className="mb-2 text-sm text-bad">{msg}</p>}
        {sel ? <Editor folders={folders} key={sel.id + JSON.stringify(sel)} {...p} t={sel} onDirty={setDirty} onSelect={(id) => { setSelId(id); router.refresh(); }} /> : <div className="card p-6 muted">No templates yet. Create one with + New template.</div>}
      </div>
    </div>
  );
}

function Editor({ t: initial, statuses, team, roles, tags, stages, today, templates, messages, folders, onDirty, onSelect }: Props & { folders: string[]; t: Template; onDirty: (d: boolean) => void; onSelect: (id: string | null) => void }) {
  const router = useRouter();
  const [t, setT] = useState<Template>(initial);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(t) !== JSON.stringify(initial);
  const update = (next: Template) => { setT(next); onDirty(JSON.stringify(next) !== JSON.stringify(initial)); };
  const setPhase = (i: number, ph: Partial<Phase>) => update({ ...t, phases: t.phases.map((x, j) => (j === i ? { ...x, ...ph } : x)) });
  const setStep = (i: number, si: number, s: Partial<Step>) => setPhase(i, { steps: t.phases[i].steps.map((x, j) => (j === si ? { ...x, ...s } : x)) });
  const movePhase = (i: number, d: number) => { const n = [...t.phases]; [n[i], n[i + d]] = [n[i + d], n[i]]; update({ ...t, phases: n }); };
  const moveStep = (i: number, si: number, d: number) => { const n = [...t.phases[i].steps]; [n[si], n[si + d]] = [n[si + d], n[si]]; setPhase(i, { steps: n }); };
  const trigStatus = t.trigger?.startsWith("status:") ? statuses.find((s) => s.id === t.trigger!.slice(7)) : undefined;
  const advanceOptions = trigStatus ? statuses.filter((s) => s.kind === trigStatus.kind && s.id !== trigStatus.id) : [];
  const twins = t.trigger ? templates.filter((x) => x.id !== t.id && x.trigger === t.trigger) : [];
  const steps = t.phases.reduce((n, ph) => n + ph.steps.length, 0);
  const preview = expand(t, { start: today }, {});
  const field = "rounded-md border border-misty bg-paper px-2 py-1 text-sm";

  const save = () => start(async () => {
    setError("");
    const r = await saveTemplate({ id: t.id, name: t.name, trigger: t.trigger, folder: t.folder ?? "", phases: t.phases });
    if (!r.ok) { setError(r.error); return; }
    onDirty(false); router.refresh();
  });

  return (
    <div className="flex flex-col gap-3">
      <section className="card flex flex-col gap-2 p-4">
        <input aria-label="Template name" className="input text-lg font-bold" value={t.name} onChange={(e) => update({ ...t, name: e.target.value })} />
        <div className="flex flex-wrap items-end gap-3">
          <label className="label">Starts
            <select className="input w-auto" value={t.trigger ?? ""} onChange={(e) => update({ ...t, trigger: e.target.value || null, phases: t.phases.map((ph) => ({ ...ph, steps: ph.steps.map((s) => ({ ...s, advance: undefined })) })) })}>
              <option value="">By hand, from a contact</option>
              <optgroup label="Buyers">{statuses.filter((s) => s.kind === "buyer").map((s) => <option key={s.id} value={`status:${s.id}`}>When a buyer moves to {s.name}</option>)}</optgroup>
              <optgroup label="Listings">{statuses.filter((s) => s.kind === "listing").map((s) => <option key={s.id} value={`status:${s.id}`}>When a listing moves to {s.name}</option>)}</optgroup>
              <optgroup label="Offers">
                <option value="offer">When an offer is submitted (every offer)</option>
              </optgroup>
              <optgroup label="Purchase agreements">
                <option value="pa:buyer">When a buyer-side purchase agreement is added</option>
                <option value="pa:seller">When a seller-side purchase agreement is added</option>
                <option value="pending:buyer">When a buyer-side contract goes pending</option>
                <option value="pending:seller">When a seller-side contract goes pending</option>
                <option value="closed:buyer">When a buyer-side contract closes</option>
                <option value="closed:seller">When a seller-side contract closes</option>
              </optgroup>
              <optgroup label="Appointments">
                <option value="phonecall">When a phone call is booked</option>
                <option value="buyerconsult">When a Buyer consult is booked</option>
                <option value="sellerconsult">When a Seller consult is booked</option>
                <option value="anyconsult">When a Buyer consult or Seller consult is booked</option>
              </optgroup>
            </select>
          </label>
          <label className="label">Folder
            <input className="input w-44" list="template-folders" value={t.folder ?? ""} placeholder="e.g. Buyers" onChange={(e) => update({ ...t, folder: e.target.value })} />
            <datalist id="template-folders">{folders.map((f) => <option key={f} value={f} />)}</datalist>
          </label>
          <label className="label">Copy steps from
            <select className="input w-auto" value="" onChange={(e) => { const src = templates.find((x) => x.id === e.target.value); if (src) update({ ...t, phases: [...t.phases, ...src.phases.map((ph) => ({ ...ph, id: newId("p"), steps: ph.steps.map((s) => ({ ...s, id: newId("s"), advance: undefined })) }))] }); }}>
              <option value="">Choose a template…</option>
              {templates.filter((x) => x.id !== t.id && x.phases.some((ph) => ph.steps.length)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <span className="ml-auto flex gap-2">
            <button type="button" className="btn" disabled={pending || dirty} title={dirty ? "Save first" : undefined} onClick={() => start(async () => { const r = await duplicateTemplate(t.id); if (!r.ok) setError(r.error); else onSelect(r.data!.id); })}>Duplicate</button>
            <button type="button" className="btn btn-danger" disabled={pending} onBlur={() => setConfirm("")} onClick={() => {
              if (confirm !== "del") { setConfirm("del"); return; }
              start(async () => { const r = await deleteTemplate(t.id); if (!r.ok) setError(r.error); else { onDirty(false); onSelect(null); } });
            }}>{confirm === "del" ? "Click again to delete" : "Delete"}</button>
          </span>
        </div>
        <p className="text-xs muted">{t.trigger ? "Changes apply to deals that reach this point from now on. Tasks already created stay as they are." : "Apply it from any contact page: Tasks card → Apply template."}</p>
        {twins.length > 0 && <p className="text-sm text-[#9a6400]">{twins.map((x) => x.name).join(", ")} also starts here. Both will add their tasks.</p>}
      </section>

      {t.phases.map((ph, i) => (
        <section key={ph.id} className="card">
          <div className="flex flex-wrap items-center gap-2 border-b border-misty px-4 py-2">
            <input aria-label="Phase name" className="input min-w-[160px] flex-1 font-semibold" value={ph.name} onChange={(e) => setPhase(i, { name: e.target.value })} />
            <span className="text-xs muted">{ph.steps.length} step{ph.steps.length === 1 ? "" : "s"}</span>
            <button type="button" className="btn px-2" aria-label={`Move phase ${ph.name} up`} disabled={i === 0} onClick={() => movePhase(i, -1)}>↑</button>
            <button type="button" className="btn px-2" aria-label={`Move phase ${ph.name} down`} disabled={i === t.phases.length - 1} onClick={() => movePhase(i, 1)}>↓</button>
            <button type="button" className="btn px-2 text-bad" aria-label={`Delete phase ${ph.name}`} onBlur={() => setConfirm("")}
              onClick={() => { if (ph.steps.length && confirm !== ph.id) { setConfirm(ph.id); return; } update({ ...t, phases: t.phases.filter((_, j) => j !== i) }); }}>{confirm === ph.id ? "Delete?" : "×"}</button>
          </div>
          {ph.steps.map((s, si) => (
            <div key={s.id} className="flex flex-col gap-2 border-b border-misty/60 px-4 py-2.5 last:border-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex gap-1">
                  <button type="button" className="btn px-1.5 py-0.5" aria-label={`Move ${s.name} up`} disabled={si === 0} onClick={() => moveStep(i, si, -1)}>↑</button>
                  <button type="button" className="btn px-1.5 py-0.5" aria-label={`Move ${s.name} down`} disabled={si === ph.steps.length - 1} onClick={() => moveStep(i, si, 1)}>↓</button>
                </span>
                <input aria-label="Step name" className={`${field} min-w-[200px] flex-1 font-medium`} value={s.name} onChange={(e) => setStep(i, si, { name: e.target.value })} />
                <label className="flex items-center gap-1 text-xs font-semibold muted">Assignee
                  <select className={field} value={s.assignee} onChange={(e) => setStep(i, si, { assignee: e.target.value })}>
                    <option value="">Person&apos;s assignee</option>{team.map((n) => <option key={n}>{n}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-1 text-xs font-semibold muted">Type
                  <select className={field} value={s.type} onChange={(e) => setStep(i, si, { type: e.target.value as Step["type"] })}>
                    {STEP_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </label>
                <span className="ml-auto flex gap-1">
                  <button type="button" className="btn px-1.5 py-0.5" aria-label={`Duplicate ${s.name}`} title="Duplicate" onClick={() => setPhase(i, { steps: [...ph.steps.slice(0, si + 1), { ...s, id: newId("s") }, ...ph.steps.slice(si + 1)] })}>⧉</button>
                  <button type="button" className="btn px-1.5 py-0.5 text-bad" aria-label={`Delete ${s.name}`} onClick={() => setPhase(i, { steps: ph.steps.filter((_, j) => j !== si) })}>×</button>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-14 max-sm:pl-0">
                <span className="flex flex-wrap items-center gap-1 text-xs font-semibold muted">Due
                  {s.dir === "minutesBefore" || s.dir === "minutesAfter" ? (
                    <select aria-label={`Minutes for ${s.name}`} className={field} value={s.minutes ?? 15} onChange={(e) => setStep(i, si, { minutes: Number(e.target.value) })}>
                      {MINUTE_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  ) : (
                    <input aria-label={`Days for ${s.name}`} type="number" min={0} max={730} className={`${field} w-16`} value={s.days} disabled={s.dir === "on" || s.dir === "none"} onChange={(e) => setStep(i, si, { days: Math.max(0, Number(e.target.value) || 0) })} />
                  )}
                  <select aria-label={`When ${s.name} is due`} className={field} value={s.dir} onChange={(e) => {
                    const dir = e.target.value as Step["dir"];
                    // Minutes before only makes sense for the phone call, which has a time.
                    const byMinutes = dir === "minutesBefore" || dir === "minutesAfter";
                    setStep(i, si, byMinutes ? { dir, days: 0, minutes: s.minutes ?? 15, anchor: TIMED_ANCHORS.includes(s.anchor) ? s.anchor : "phoneCall" } : { dir, minutes: undefined, days: dir === "on" || dir === "none" ? 0 : s.days || 1 });
                  }}>
                    <option value="before">days before</option><option value="after">days after</option><option value="on">on the day of</option>
                    <option value="minutesBefore">minutes before</option><option value="minutesAfter">minutes after</option><option value="none">no due date</option>
                  </select>
                  <select aria-label={`Date ${s.name} counts from`} className={field} value={s.anchor} disabled={s.dir === "none"} onChange={(e) => setStep(i, si, { anchor: e.target.value as Step["anchor"] })}>
                    {ANCHORS.filter(([k]) => (s.dir !== "minutesBefore" && s.dir !== "minutesAfter") || TIMED_ANCHORS.includes(k)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </span>
                <label className="flex items-center gap-1 text-xs font-semibold muted">Only when
                  <select className={field} value={s.cond} onChange={(e) => setStep(i, si, { cond: e.target.value as Step["cond"] })}>
                    {CONDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </label>
                {advanceOptions.length > 0 && s.type !== "tags" && s.type !== "stage" && (
                  <label className="flex items-center gap-1 text-xs font-semibold muted">When done
                    <select className={field} value={s.advance ?? ""} onChange={(e) => setStep(i, si, { advance: e.target.value || undefined })}>
                      <option value="">Nothing else</option>{advanceOptions.map((o) => <option key={o.id} value={o.id}>Move deal to {o.name}</option>)}
                    </select>
                  </label>
                )}
                {(s.type === "email" || s.type === "text") && (
                  <label className="flex items-center gap-1 text-xs font-semibold muted">Message template
                    {(() => {
                      // A name typed before templates existed links to the template with that name, once it's created.
                      const named = !s.messageId && s.message ? messages.find((m) => m.kind === s.type && m.name.toLowerCase() === s.message!.toLowerCase()) : undefined;
                      return (
                    <select className={`${field} max-w-64`} value={s.messageId ?? named?.id ?? (s.message ? "__legacy" : "")} onChange={(e) => setStep(i, si, e.target.value === "__legacy" ? {} : { messageId: e.target.value || undefined, message: e.target.value ? undefined : s.message })}>
                      <option value="">None</option>
                      {s.message && !s.messageId && !named && <option value="__legacy">&quot;{s.message}&quot; (not created yet)</option>}
                      {messages.filter((m) => m.kind === s.type).map((m) => <option key={m.id} value={m.id}>{m.folder ? `${m.folder} · ` : ""}{m.name}</option>)}
                    </select>
                      );
                    })()}
                  </label>
                )}
                {(s.type === "email" || s.type === "text") && <AutoSendFields step={s} team={team} roles={roles} field={field} onChange={(auto) => setStep(i, si, { auto })} />}
                {s.type === "stage" && (
                  <label className="flex items-center gap-1 text-xs font-semibold muted">Change contact&apos;s stage to
                    <select className={field} value={s.stage ?? ""} onChange={(e) => setStep(i, si, { stage: e.target.value || undefined })}>
                      <option value="">Pick a stage…</option>{stages.map((n) => <option key={n}>{n}</option>)}
                      {s.stage && !stages.includes(s.stage) && <option value={s.stage}>{s.stage} (removed)</option>}
                    </select>
                  </label>
                )}
                {s.type === "tags" && (
                  <>
                    <TagList label="Add tags" value={s.addTags ?? []} all={tags} onChange={(v) => setStep(i, si, { addTags: v })} />
                    <TagList label="Remove tags" value={s.removeTags ?? []} all={tags} onChange={(v) => setStep(i, si, { removeTags: v })} />
                  </>
                )}
              </div>
            </div>
          ))}
          {ph.steps.length === 0 && <p className="px-4 py-2 text-sm muted">No steps in this phase yet.</p>}
          <div className="border-t border-misty px-4 py-2"><button type="button" className="btn" onClick={() => setPhase(i, { steps: [...ph.steps, blankStep()] })}>+ Add step</button></div>
        </section>
      ))}
      <div><button type="button" className="btn btn-primary" onClick={() => update({ ...t, phases: [...t.phases, { id: newId("p"), name: "New phase", steps: [] }] })}>+ Add phase</button></div>

      {steps > 0 && (
        <section className="card p-4">
          <h2 className="font-bold">Tasks it creates if it starts today <span className="text-sm font-normal muted">{preview.tasks.length} of {steps}</span></h2>
          <ul className="mt-2 flex flex-col text-sm">
            {preview.tasks.slice(0, 10).map((x) => (
              <li key={x.step.id} className="flex justify-between gap-2 border-t border-misty/60 py-1 first:border-0">
                <span>{x.step.type === "stage" ? `Stage → ${x.step.stage ?? "?"}` : x.step.type === "tags" ? `Tags: ${[...(x.step.addTags ?? []).map((g) => `+${g}`), ...(x.step.removeTags ?? []).map((g) => `−${g}`)].join(", ")}` : x.step.name}</span>
                <span className="text-xs muted">{x.due ? longIso(x.due) : x.waiting ? `Waits for the ${ANCHORS.find(([k]) => k === x.step.anchor)?.[1]} date` : "No due date"} · {x.step.assignee || "Person's assignee"}</span>
              </li>
            ))}
          </ul>
          {preview.tasks.length > 10 && <p className="mt-1 text-xs muted">and {preview.tasks.length - 10} more.</p>}
          {preview.skipped > 0 && <p className="mt-1 text-xs muted">{preview.skipped} step{preview.skipped === 1 ? "" : "s"} only apply to some properties (Only when).</p>}
          <p className="mt-1 text-xs muted">On a real deal, contract-date steps use that deal&apos;s dates.</p>
        </section>
      )}
      <SaveBar dirty={dirty} pending={pending} error={error} onDiscard={() => { update(initial); setError(""); }} onSave={save} />
    </div>
  );
}

function TagList({ label, value, all, onChange }: { label: string; value: string[]; all: string[]; onChange: (v: string[]) => void }) {
  return (
    <span className="flex flex-wrap items-center gap-1 text-xs font-semibold muted">{label}
      {value.map((g) => <button key={g} type="button" className="chip" aria-label={`Remove ${g} from ${label.toLowerCase()}`} onClick={() => onChange(value.filter((x) => x !== g))}>{g} ×</button>)}
      <select aria-label={label} className="rounded-md border border-misty bg-paper px-2 py-1 text-sm font-normal text-charcoal" value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])}>
        <option value="">+ tag</option>{all.filter((g) => !value.includes(g)).map((g) => <option key={g}>{g}</option>)}
      </select>
    </span>
  );
}

const HALF_HOURS = Array.from({ length: 25 }, (_, i) => `${String(8 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
const clock = (t: string) => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`; };

/**
 * "Send automatically" on a text/email step (owner request 2026-10-29): it goes out by itself at this time on the due
 * date, from the person picked, to the people ticked. Until then it's listed under Scheduled, where it can be turned off.
 */
function AutoSendFields({ step, team, roles, field, onChange }: { step: Step; team: string[]; roles: { id: string; name: string }[]; field: string; onChange: (a: Step["auto"]) => void }) {
  const a = step.auto;
  const timed = step.dir === "minutesBefore" || step.dir === "minutesAfter";
  const toggle = (k: string, on: boolean) => a && onChange({ ...a, to: on ? [...a.to, k] : a.to.filter((x) => x !== k) });
  const opts: [string, string][] = [["client", "Client(s)"], ...roles.map((r): [string, string] => [`people:${r.id}`, r.name]), ...team.map((t): [string, string] => [`team:${t}`, t])];
  return (
    <div className="flex w-full flex-col gap-1.5 rounded-md border border-dashed border-misty px-2.5 py-2">
      <label className="flex items-center gap-2 text-xs font-semibold">
        <input type="checkbox" checked={!!a} disabled={step.dir === "none"} onChange={(e) => onChange(e.target.checked ? { from: "", to: ["client"], time: "09:00" } : undefined)} />
        Send automatically {step.dir === "none" && <span className="font-normal muted">(needs a due date)</span>}
      </label>
      {a && (
        <>
          <span className="flex flex-wrap items-center gap-2 text-xs font-semibold muted">
            {!timed && <label className="flex items-center gap-1">at<select className={field} value={a.time} onChange={(e) => onChange({ ...a, time: e.target.value })}>{HALF_HOURS.map((t) => <option key={t} value={t}>{clock(t)}</option>)}</select>on the due date</label>}
            {timed && <span>at the step&apos;s time ({step.minutes} min {step.dir === "minutesBefore" ? "before" : "after"})</span>}
            <label className="flex items-center gap-1">from<select className={field} value={a.from} onChange={(e) => onChange({ ...a, from: e.target.value })}><option value="">Whoever the step is assigned to</option>{team.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
          </span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <b className="muted">to</b>
            {opts.map(([k, l]) => <label key={k} className="flex items-center gap-1"><input type="checkbox" checked={a.to.includes(k)} onChange={(e) => toggle(k, e.target.checked)} /> {l}</label>)}
          </span>
          {!step.messageId && !step.message && <span className="text-xs text-bad">Pick a message template above, or it can&apos;t send.</span>}
        </>
      )}
    </div>
  );
}
