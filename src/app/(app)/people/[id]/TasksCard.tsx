"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { TaskRow, TeamMember } from "@/server/tasks";
import { diffDays, dueLabel, TASK_KINDS } from "@/lib/tasks";
import { Modal } from "@/components/Modal";
import { TimeSelect } from "@/components/TimeSelect";
import { applyTemplateToPerson, completeDateTask, completeTask, createTask, reopenTask } from "../../tasks/actions";
import { Avatar, CheckButton, KindIcon } from "../../tasks/parts";
import { TaskDetail } from "../../tasks/TaskDetail";
import type { ListRow } from "@/server/tasks";

/** Contact page → Tasks: everything open for this person, soonest first (SPEC.md §6.3). */
type TemplateOption = { id: string; name: string; manual: boolean };
type FileOption = { id: string; label: string };

export function TasksCard({ personId, personName, rows, team, today, meId, templates, files, lists }: { personId: string; personName: string; rows: TaskRow[]; team: TeamMember[]; today: string; meId: string; templates: TemplateOption[]; files: FileOption[]; lists: ListRow[] }) {
  const router = useRouter();
  const [all, setAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const [applying, setApplying] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState<Record<string, { row: TaskRow; realId: string; nextId: string | null }>>({});
  const [error, setError] = useState("");
  const [, start] = useTransition();
  // Checked-off tasks move to the bottom, crossed out, until the page is reloaded, so a mis-click is easy to undo
  // (owner request 2026-10-21).
  const ids = rows.map((r) => r.id).join(",");
  const [seen, setSeen] = useState(ids);
  const [order, setOrder] = useState(() => rows.map((r) => r.id));
  if (ids !== seen) {
    const next = rows.map((r) => r.id);
    for (const id of Object.keys(done)) if (!next.includes(id)) next.splice(Math.min(Math.max(0, order.indexOf(id)), next.length), 0, id);
    setSeen(ids); setOrder(next);
  }
  const inOrder = order.map((id) => (done[id] ? { ...done[id].row, done: true } : rows.find((r) => r.id === id))).filter((t): t is TaskRow => !!t);
  const list = [...inOrder.filter((t) => !t.done), ...inOrder.filter((t) => t.done)];
  // Overdue, then Today; anything later (or with no date yet) waits under "Upcoming" (owner request 2026-10-28).
  const late = list.filter((t) => t.due && t.due < today), now = list.filter((t) => t.due === today);
  const later = list.filter((t) => !late.includes(t) && !now.includes(t));

  const toggle = (t: TaskRow) => start(async () => {
    setError("");
    const d = done[t.id];
    if (d) {
      const r = await reopenTask({ id: d.realId, nextId: d.nextId });
      if (!r.ok) { setError(r.error); return; }
      setDone((x) => { const n = { ...x }; delete n[t.id]; return n; });
    } else {
      setDone((x) => ({ ...x, [t.id]: { row: t, realId: t.id, nextId: null } }));
      // Birthday / homeiversary tasks are saved when checked off; undo then needs the saved task's id.
      const r = t.virtual ? await completeDateTask(t.id) : await completeTask(t.id);
      if (!r.ok) { setError(r.error); setDone((x) => { const n = { ...x }; delete n[t.id]; return n; }); return; }
      const realId = t.virtual ? (r.data as { id: string }).id : t.id;
      const nextId = t.virtual ? null : (r.data as { nextId: string | null } | undefined)?.nextId ?? null;
      setDone((x) => ({ ...x, [t.id]: { row: t, realId, nextId } }));
    }
    router.refresh();
  });

  const row = (t: TaskRow) => (
    <li key={t.id} className="flex items-start gap-2 border-t border-misty/60 py-1.5 first:border-0">
      <span className="pt-0.5"><CheckButton task={t} onToggle={() => toggle(t)} /></span>
      <button type="button" onClick={() => setOpenId(t.id)} className="flex min-w-0 flex-1 flex-col text-left text-sm hover:underline">
        <span className={t.done ? "muted line-through" : "font-medium"}>{t.title}{t.step && <span className="font-normal muted"> · {t.step.source}</span>}</span>
        <span className={`flex items-center gap-1.5 text-xs ${!t.done && t.due && diffDays(t.due, today) < 0 ? "font-medium text-bad" : "muted"}`}>
          <KindIcon kind={t.kind} />{t.due || !t.step?.timing ? dueLabel(t.due, t.time, today) : `Waits for date · ${t.step.timing}`}
        </span>
      </button>
      <Avatar member={team.find((m) => m.id === t.assigneeId)} />
    </li>
  );

  return (
    <section className="card p-4" aria-labelledby="tasks-h">
      <div className="flex items-center justify-between">
        <h3 id="tasks-h" className="font-bold">Tasks</h3>
        <button type="button" className="link text-sm" onClick={() => setAdding(true)}>+ Add task</button>
      </div>
      {list.length === 0 && <p className="mt-1 text-sm muted">No open tasks.</p>}
      {late.length > 0 && <h4 className="mt-2 text-xs font-semibold uppercase tracking-wider text-bad">Overdue <span className="font-normal">{late.length}</span></h4>}
      {late.length > 0 && <ul className="flex flex-col">{late.map(row)}</ul>}
      {now.length > 0 && <h4 className="mt-2 text-xs font-semibold uppercase tracking-wider muted">Today <span className="font-normal">{now.length}</span></h4>}
      {now.length > 0 && <ul className="flex flex-col">{now.map(row)}</ul>}
      {list.length > 0 && !late.length && !now.length && <p className="mt-1 text-sm muted">Nothing due today.</p>}
      {later.length > 0 && <button type="button" className="mt-2 text-left text-xs font-semibold uppercase tracking-wider muted hover:text-charcoal" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "▾" : "▸"} Upcoming <span className="font-normal">{later.length}</span></button>}
      {all && later.length > 0 && <ul className="flex flex-col">{later.map(row)}</ul>}
      {templates.length > 0 && <button type="button" className="link mt-2 block text-sm" onClick={() => setApplying(true)}>Apply template</button>}
      {msg && <p role="status" className="mt-1 text-sm text-accent">{msg}</p>}
      {error && <p role="alert" className="mt-1 text-sm text-bad">{error}</p>}
      {openId && list.find((t) => t.id === openId) && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !dirty) setOpenId(null); }}>
          <TaskDetail popup key={openId} task={list.find((t) => t.id === openId)!} lists={lists} team={team} notify={setMsg}
            onClose={(discarded) => { if (dirty && !discarded) { setMsg("Save or cancel your changes first."); return; } setDirty(false); setMsg(""); setOpenId(null); }}
            onToggle={() => toggle(list.find((t) => t.id === openId)!)} onDirty={setDirty}
            onSaved={() => router.refresh()} onDeleted={() => { setDirty(false); setOpenId(null); router.refresh(); }} />
        </div>
      )}
      {applying && <ApplyTemplateModal personId={personId} personName={personName} templates={templates} files={files} today={today} onClose={() => setApplying(false)}
        onDone={(m) => { setApplying(false); setMsg(m); router.refresh(); }} />}
      {adding && <CreateTaskModal personId={personId} personName={personName} team={team} today={today} meId={meId} onClose={() => setAdding(false)} onCreated={() => { setAdding(false); router.refresh(); }} />}
    </section>
  );
}

/** The Create task pop-up: name, type, assigned to, date, time. */
export function CreateTaskModal({ personId, personName, team, today, meId, onClose, onCreated }: {
  personId: string | null; personName?: string; team: TeamMember[]; today: string; meId: string; onClose: () => void; onCreated: () => void;
}) {
  const [f, setF] = useState({ title: "", kind: "followup", assigneeId: meId, due: today, time: "" });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await createTask({ title: f.title, kind: f.kind as never, personId, assigneeId: f.assigneeId || null, due: f.due, time: f.time });
      if (!r.ok) { setError(r.error); return; }
      onCreated();
    });
  };
  return (
    <Modal title={personName ? `Create task for ${personName}` : "Create task"} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="label">Task name
          <input autoFocus className="input" value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Call about pre-approval" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="label">Type
            <select className="input" value={f.kind} onChange={(e) => set({ kind: e.target.value })}>
              {TASK_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="label">Assigned to
            <select className="input" value={f.assigneeId} onChange={(e) => set({ assigneeId: e.target.value })}>
              {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <label className="label">Date
            <input type="date" className="input" value={f.due} onChange={(e) => set({ due: e.target.value })} required />
          </label>
          <div className="label">Time
            <TimeSelect label="Time" allowNone value={f.time} onChange={(x) => set({ time: x })} />
            {f.time && <span className="text-xs font-normal muted">⏰ An alarm rings for {team.find((m) => m.id === f.assigneeId)?.name.split(" ")[0] ?? "them"} at this time while HQ is open.</span>}
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={pending || !f.title.trim()}>Create task</button>
        </div>
      </form>
    </Modal>
  );
}

/** Apply a template by hand: its steps become tasks counted from the start date. */
function ApplyTemplateModal({ personId, personName, templates, files, today, onClose, onDone }: { personId: string; personName: string; templates: TemplateOption[]; files: FileOption[]; today: string; onClose: () => void; onDone: (m: string) => void }) {
  const manual = templates.filter((t) => t.manual), auto = templates.filter((t) => !t.manual);
  const [f, setF] = useState({ templateId: (manual[0] ?? templates[0]).id, start: today, fileId: files.length === 1 ? files[0].id : "" });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <Modal title={`Apply a template to ${personName}`} onClose={onClose}>
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); start(async () => {
        const r = await applyTemplateToPerson({ personId, templateId: f.templateId, start: f.start, fileId: f.fileId || null });
        if (!r.ok) { setError(r.error); return; }
        onDone(`Applied "${r.data!.name}": ${r.data!.count} task${r.data!.count === 1 ? "" : "s"} added.`);
      }); }}>
        <label className="label">Template
          <select className="input" value={f.templateId} onChange={(e) => setF({ ...f, templateId: e.target.value })}>
            {manual.length > 0 && <optgroup label="Apply by hand">{manual.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>}
            {auto.length > 0 && <optgroup label="Also start automatically">{auto.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>}
          </select>
        </label>
        <label className="label">Start date
          <input type="date" className="input" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} required />
        </label>
        {files.length > 0 && (
          <label className="label">Link to
            <select className="input" value={f.fileId} onChange={(e) => setF({ ...f, fileId: e.target.value })}>
              <option value="">Just {personName.split(" ")[0]} (no file)</option>
              {files.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </label>
        )}
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={pending}>Apply template</button>
        </div>
      </form>
    </Modal>
  );
}
