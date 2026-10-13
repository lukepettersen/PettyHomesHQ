"use client";

import { useState, useTransition } from "react";
import type { ListRow, TaskRow, TeamMember } from "@/server/tasks";
import { formatTime, PRIORITIES, REPEATS, type Subtask } from "@/lib/tasks";
import { deleteTask, updateTask } from "./actions";
import { CheckButton, PersonLink } from "./parts";

type Draft = { title: string; notes: string; due: string; time: string; repeat: string; priority: number; listId: string; assigneeId: string; subtasks: Subtask[] };

const draftOf = (t: TaskRow): Draft => ({
  title: t.title, notes: t.notes, due: t.due ?? "", time: formatTime(t.time), repeat: t.repeat ?? "", priority: t.priority,
  listId: t.listId ?? "", assigneeId: t.assigneeId ?? "", subtasks: t.subtasks.map((s) => ({ ...s })),
});

/** Slides over the board. Edits are held until Save changes (SPEC.md §5 save rule). */
export function TaskDetail({ task, lists, team, onClose, onToggle, onDirty, onSaved, onDeleted, notify }: {
  task: TaskRow; lists: ListRow[]; team: TeamMember[];
  onClose: () => void; onToggle: () => void; onDirty: (dirty: boolean) => void; onSaved: (id: string) => void; onDeleted: () => void; notify: (m: string) => void;
}) {
  const [orig, setOrig] = useState(() => draftOf(task));
  const [d, setD] = useState<Draft>(orig);
  // When fresh data arrives (after a save or refresh) and nothing is being edited, show it.
  const incoming = JSON.stringify(draftOf(task));
  const [seen, setSeen] = useState(incoming);
  if (incoming !== seen) {
    setSeen(incoming);
    if (JSON.stringify(d) === JSON.stringify(orig)) { setOrig(draftOf(task)); setD(draftOf(task)); }
  }
  const [newSub, setNewSub] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(d) !== JSON.stringify(orig);
  const set = (patch: Partial<Draft>) => { const next = { ...d, ...patch }; setD(next); onDirty(JSON.stringify(next) !== JSON.stringify(orig)); };
  const userLists = lists.filter((l) => !l.builtin);

  const save = () => start(async () => {
    setError("");
    const r = await updateTask({
      id: task.id, title: d.title, notes: d.notes, due: d.due || null, time: d.time, repeat: (d.repeat || null) as never,
      priority: d.priority, listId: d.listId || null, assigneeId: d.assigneeId || null, subtasks: d.subtasks,
    });
    if (!r.ok) { setError(r.error); return; }
    setOrig(d); onDirty(false); onSaved(r.data?.id ?? task.id); notify("Saved.");
  });
  const remove = () => {
    if (!confirmDel) { setConfirmDel(true); return; }
    start(async () => {
      const r = await deleteTask(task.id);
      if (!r.ok) { setError(r.error); return; }
      onDirty(false); onDeleted(); notify("Task deleted. An Admin can restore it from Trash for 30 days.");
    });
  };
  const addSub = () => { const v = newSub.trim(); if (!v) return; set({ subtasks: [...d.subtasks, { title: v, done: false }] }); setNewSub(""); };

  const field = "w-full rounded-md border border-misty bg-paper px-2 py-1 text-sm";
  return (
    <aside aria-label="Task details" className="fixed inset-y-0 right-0 z-30 flex w-full max-w-[380px] flex-col overflow-y-auto border-l border-misty bg-white shadow-xl xl:sticky xl:top-3 xl:z-auto xl:max-h-[calc(100vh-90px)] xl:rounded-xl xl:border xl:shadow-none">
      <div className="flex items-start gap-2.5 border-b border-misty px-3.5 pt-3.5 pb-2.5">
        <span className="pt-1"><CheckButton task={task} onToggle={onToggle} /></span>
        <textarea aria-label="Title" rows={2} value={d.title} onChange={(e) => set({ title: e.target.value })} className="min-w-0 flex-1 resize-none bg-transparent text-[15px] font-semibold outline-none" />
        <button type="button" onClick={onClose} aria-label="Close" className="px-1 text-xl leading-none muted hover:text-charcoal">×</button>
      </div>

      {task.step && (
        <p className="mx-3.5 mt-3 flex flex-col gap-1 rounded-md bg-sunken px-3 py-2 text-[12.5px] muted">
          <span>From {task.personName ? <b className="text-charcoal">{task.personName}</b> : "a person"}&apos;s {task.step.source.toLowerCase()}{task.step.phase ? ` · ${task.step.phase}` : ""}</span>
          {task.step.timing && <span>Timing: {task.step.timing}.{task.step.locked ? " Change the date on their page and this moves with it." : ""}</span>}
        </p>
      )}
      {task.cat === "dates" && (
        <p className="mx-3.5 mt-3 rounded-md bg-sunken px-3 py-2 text-[12.5px] muted">
          From {task.personName ? <b className="text-charcoal">{task.personName}</b> : "a person"}&apos;s Important Dates, using the rules in Admin → Date reminders.
        </p>
      )}

      <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-x-2.5 gap-y-2 px-3.5 py-3 text-sm">
        <label htmlFor="d-due" className="text-xs font-semibold muted">Due</label>
        <input id="d-due" type="date" className={field} value={d.due} disabled={task.step?.locked} title={task.step?.locked ? "Set by a contract date" : undefined} onChange={(e) => set({ due: e.target.value })} />
        <label htmlFor="d-time" className="text-xs font-semibold muted">Time</label>
        <input id="d-time" className={field} placeholder="None" value={d.time} onChange={(e) => set({ time: e.target.value })} />
        <label htmlFor="d-repeat" className="text-xs font-semibold muted">Repeat</label>
        <select id="d-repeat" className={field} value={d.repeat} onChange={(e) => set({ repeat: e.target.value })}>
          <option value="">Never</option>
          {REPEATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <label htmlFor="d-list" className="text-xs font-semibold muted">List</label>
        <select id="d-list" className={field} value={d.listId} onChange={(e) => set({ listId: e.target.value })}>
          <option value="">None (sorted automatically)</option>
          {userLists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <label htmlFor="d-p" className="text-xs font-semibold muted">Priority</label>
        <select id="d-p" className={field} value={d.priority} onChange={(e) => set({ priority: Number(e.target.value) })}>
          {PRIORITIES.map((p, i) => <option key={p} value={i}>{p}</option>)}
        </select>
        <label htmlFor="d-who" className="text-xs font-semibold muted">Assignee</label>
        <select id="d-who" className={field} value={d.assigneeId} onChange={(e) => set({ assigneeId: e.target.value })}>
          <option value="">Nobody</option>
          {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <span className="text-xs font-semibold muted">Linked to</span>
        <span>{task.personId && task.personName ? <PersonLink id={task.personId} name={task.personName} /> : <span className="muted">Nothing (general task)</span>}</span>
      </div>

      <div className="flex flex-col gap-1.5 px-3.5 py-3">
        <h3 className="text-xs font-semibold muted">Subtasks</h3>
        {d.subtasks.length === 0 && <span className="text-[12.5px] muted">None yet</span>}
        {d.subtasks.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <input type="checkbox" className="h-[15px] w-[15px] accent-[#5f6447]" checked={s.done} onChange={(e) => set({ subtasks: d.subtasks.map((x, j) => j === i ? { ...x, done: e.target.checked } : x) })} />
              <span className={s.done ? "muted line-through" : ""}>{s.title}</span>
            </label>
            <button type="button" aria-label={`Remove subtask ${s.title}`} className="px-1 muted hover:text-bad" onClick={() => set({ subtasks: d.subtasks.filter((_, j) => j !== i) })}>×</button>
          </div>
        ))}
        <div className="flex gap-1.5">
          <input aria-label="New subtask" placeholder="Add a subtask" className={field} value={newSub} onChange={(e) => setNewSub(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSub(); } }} />
          <button type="button" className="btn" onClick={addSub}>Add</button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 px-3.5 py-3">
        <label htmlFor="d-notes" className="text-xs font-semibold muted">Notes</label>
        <textarea id="d-notes" placeholder="Add notes" className={`${field} min-h-[70px] resize-y`} value={d.notes} onChange={(e) => set({ notes: e.target.value })} />
      </div>

      {error && <p role="alert" className="px-3.5 text-sm text-bad">{error}</p>}
      <div className="flex justify-end gap-2 px-3.5 py-3">
        <button type="button" className="btn" disabled={!dirty || pending} onClick={() => { setD(orig); onDirty(false); notify("Changes discarded."); }}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={!dirty || pending} onClick={save}>{dirty ? "Save changes" : "Saved"}</button>
      </div>
      <div className="px-3.5 pt-1 pb-4">
        <button type="button" className="btn btn-danger" disabled={pending} onBlur={() => setConfirmDel(false)} onClick={remove}>{confirmDel ? "Click again to delete" : "Delete task"}</button>
      </div>
    </aside>
  );
}
