"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { TaskRow, TeamMember } from "@/server/tasks";
import { diffDays, dueLabel } from "@/lib/tasks";
import { completeTask, reopenTask } from "../../tasks/actions";
import { Avatar, CheckButton, KindIcon } from "../../tasks/parts";

/** A file's or contract's checklist: phases folded (open steps already show in the Tasks card). */
export function Checklist({ title, tasks, today, team }: { title: string; tasks: TaskRow[]; today: string; team: TeamMember[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [, start] = useTransition();
  if (!tasks.length) return <p className="mt-3 text-sm muted">No checklist for this yet. Templates for it can be added in Admin → Task templates.</p>;
  const done = tasks.filter((t) => t.done).length;
  const phases = [...new Set(tasks.map((t) => t.step?.phase ?? "Steps"))];
  const toggle = (t: TaskRow) => start(async () => {
    setError("");
    const r = t.done ? await reopenTask({ id: t.id }) : await completeTask(t.id);
    if (!r.ok) setError(r.error); else router.refresh();
  });
  return (
    <div className="mt-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider muted">{title} · {done} of {tasks.length} done</h4>
      <div className="mt-1 flex flex-col rounded-lg border border-misty bg-white">
        {phases.map((ph) => {
          const items = tasks.filter((t) => (t.step?.phase ?? "Steps") === ph);
          const left = items.filter((t) => !t.done).length;
          const late = items.some((t) => !t.done && t.due && diffDays(t.due, today) < 0);
          return (
            <div key={ph} className="border-t border-misty first:border-0">
              <button type="button" aria-expanded={!!open[ph]} onClick={() => setOpen({ ...open, [ph]: !open[ph] })} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-paper">
                <span><span aria-hidden="true" className="mr-1.5 inline-block w-3 muted">{open[ph] ? "▾" : "▸"}</span><b>{ph}</b></span>
                <span className={`text-xs ${late ? "font-semibold text-bad" : "muted"}`}>{left ? `${left} open${late ? " · overdue" : ""}` : "All done"} · {items.length - left}/{items.length}</span>
              </button>
              {open[ph] && (
                <ul className="pb-1">
                  {items.map((t) => {
                    const overdue = !t.done && !!t.due && diffDays(t.due, today) < 0;
                    return (
                      <li key={t.id} className="flex items-center gap-2 px-3 py-1.5 pl-8 text-sm">
                        <CheckButton task={t} onToggle={() => toggle(t)} />
                        <KindIcon kind={t.kind} />
                        <span className={`min-w-0 flex-1 ${t.done ? "muted line-through" : ""}`}>{t.title}</span>
                        <span className={`whitespace-nowrap text-xs ${overdue ? "font-semibold text-bad" : "muted"}`}>{t.due ? dueLabel(t.due, t.time, today) : t.step?.timing ? `Waits for date · ${t.step.timing}` : "No due date"}</span>
                        <Avatar member={team.find((m) => m.id === t.assigneeId)} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {error && <p role="alert" className="mt-1 text-sm text-bad">{error}</p>}
    </div>
  );
}
