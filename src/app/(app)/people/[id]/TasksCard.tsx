"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { TaskRow, TeamMember } from "@/server/tasks";
import { diffDays, dueLabel, TASK_KINDS } from "@/lib/tasks";
import { Modal } from "@/components/Modal";
import { completeTask, createTask, reopenTask } from "../../tasks/actions";
import { Avatar, CheckButton } from "../../tasks/parts";

/** Contact page → Tasks: everything open for this person, soonest first (SPEC.md §6.3). */
export function TasksCard({ personId, personName, rows, team, today, meId }: { personId: string; personName: string; rows: TaskRow[]; team: TeamMember[]; today: string; meId: string }) {
  const router = useRouter();
  const [all, setAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const [done, setDone] = useState<Record<string, { row: TaskRow; nextId: string | null }>>({});
  const [error, setError] = useState("");
  const [, start] = useTransition();
  const list = [...rows.filter((r) => !done[r.id]), ...Object.values(done).map((d) => ({ ...d.row, done: true }))];
  const shown = all ? list : list.slice(0, 6);

  const toggle = (t: TaskRow) => start(async () => {
    setError("");
    const d = done[t.id];
    if (d) {
      const r = await reopenTask({ id: t.id, nextId: d.nextId });
      if (!r.ok) { setError(r.error); return; }
      setDone((x) => { const n = { ...x }; delete n[t.id]; return n; });
    } else {
      setDone((x) => ({ ...x, [t.id]: { row: t, nextId: null } }));
      const r = await completeTask(t.id);
      if (!r.ok) { setError(r.error); setDone((x) => { const n = { ...x }; delete n[t.id]; return n; }); return; }
      setDone((x) => ({ ...x, [t.id]: { row: t, nextId: r.data?.nextId ?? null } }));
    }
    router.refresh();
  });

  return (
    <section className="card p-4" aria-labelledby="tasks-h">
      <div className="flex items-center justify-between">
        <h3 id="tasks-h" className="font-bold">Tasks</h3>
        <button type="button" className="link text-sm" onClick={() => setAdding(true)}>+ Add task</button>
      </div>
      {list.length === 0 && <p className="mt-1 text-sm muted">No open tasks.</p>}
      <ul className="mt-2 flex flex-col">
        {shown.map((t) => (
          <li key={t.id} className="flex items-start gap-2 border-t border-misty/60 py-1.5 first:border-0">
            <span className="pt-0.5"><CheckButton task={t} onToggle={() => toggle(t)} /></span>
            <Link href={`/tasks?view=clients&task=${t.id}`} className="flex min-w-0 flex-1 flex-col text-sm hover:underline">
              <span className={t.done ? "muted line-through" : "font-medium"}>{t.title}</span>
              <span className={`text-xs ${!t.done && t.due && diffDays(t.due, today) < 0 ? "font-medium text-bad" : "muted"}`}>{dueLabel(t.due, t.time, today)}</span>
            </Link>
            <Avatar member={team.find((m) => m.id === t.assigneeId)} />
          </li>
        ))}
      </ul>
      {list.length > 6 && <button type="button" className="link mt-1 text-sm" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${list.length}`}</button>}
      {error && <p role="alert" className="mt-1 text-sm text-bad">{error}</p>}
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
          <label className="label">Time
            <input className="input" value={f.time} onChange={(e) => set({ time: e.target.value })} placeholder="Optional, e.g. 2pm" />
          </label>
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
