"use client";

import Link from "next/link";
import { useEffect } from "react";
import type { TaskRow, TeamMember } from "@/server/tasks";
import { diffDays, dueLabel, repeatLabel } from "@/lib/tasks";

const P_BORDER = ["border-misty", "border-[#2f6fb3]", "border-[#b7860b]", "border-[#c2410c]"];

export function Avatar({ member }: { member?: TeamMember }) {
  if (!member) return <span className="h-[22px] w-[22px] flex-none" />;
  return (
    <span title={member.name} className={`grid h-[22px] w-[22px] flex-none place-items-center rounded-full text-[10px] font-bold ${member.isOwner ? "bg-accent-soft text-accent" : "bg-[#ebe8f2] text-[#6b6480]"}`}>
      {member.initials}
    </span>
  );
}

export function CheckButton({ task, onToggle, disabled }: { task: Pick<TaskRow, "title" | "done" | "priority">; onToggle: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onToggle} disabled={disabled} aria-pressed={task.done} aria-label={`${task.done ? "Mark not done" : "Complete"}: ${task.title}`}
      className={`grid h-[19px] w-[19px] flex-none place-items-center rounded-[5px] border-[1.8px] p-0 ${task.done ? "border-accent bg-accent text-white" : `${P_BORDER[task.priority] ?? P_BORDER[0]} bg-white`}`}>
      {task.done && <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
    </button>
  );
}

export function TaskLine({ task, today, team, selected, showPerson = true, onToggle, onOpen }: {
  task: TaskRow; today: string; team: TeamMember[]; selected?: boolean; showPerson?: boolean; onToggle: () => void; onOpen: () => void;
}) {
  const late = !task.done && !!task.due && diffDays(task.due, today) < 0;
  const subs = task.subtasks.length;
  return (
    <div className={`grid grid-cols-[24px_minmax(0,1fr)] items-center gap-x-2.5 border-t border-misty px-3 py-2 first:border-t-0 sm:grid-cols-[24px_minmax(0,1fr)_auto] ${selected ? "bg-accent-soft" : "hover:bg-paper"}`}>
      <CheckButton task={task} onToggle={onToggle} />
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-col gap-0.5 text-left">
        <span className={`font-medium ${task.done ? "text-muted line-through" : ""}`}>{task.title}</span>
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs muted">
          {showPerson && task.personName && <span className="font-semibold text-accent">{task.personName}</span>}
          {subs > 0 && <span>☐ {task.subtasks.filter((s) => s.done).length}/{subs}</span>}
          {task.repeat && <span>↻ {repeatLabel(task.repeat)}</span>}
          {task.cat === "dates" && <span className="rounded bg-sunken px-1.5">From Important Dates</span>}
          {task.step && <span className="rounded bg-sunken px-1.5">{task.step.source}</span>}
        </span>
      </button>
      <span className="col-start-2 flex items-center gap-2 sm:col-start-3">
        <span className={`whitespace-nowrap text-[12.5px] ${late ? "font-medium text-bad" : "muted"}`}>{dueLabel(task.due, task.time, today)}</span>
        <Avatar member={team.find((m) => m.id === task.assigneeId)} />
      </span>
    </div>
  );
}

export function PersonLink({ id, name }: { id: string; name: string }) {
  return <Link href={`/people/${id}?from=tasks`} className="link">{name}</Link>;
}

export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [message, onDone]);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      {message && <div className="pointer-events-auto max-w-xl rounded-lg bg-charcoal px-4 py-2.5 text-sm text-white shadow-lg">{message}</div>}
    </div>
  );
}
