import "server-only";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { isDueForTouch } from "@/lib/filters";
import { initials, isoFromDate, todayCentral } from "@/lib/normalize";
import { categoryOf, importantDateTasks, parseSubtasks, type Subtask } from "@/lib/tasks";

export type TaskRow = {
  id: string; // task id, or the sourceKey for an Important dates task not yet saved
  virtual: boolean; // Important dates task computed from the rules (no row yet)
  title: string;
  notes: string;
  kind: string;
  due: string | null;
  time: string | null;
  repeat: string | null;
  priority: number;
  subtasks: Subtask[];
  listId: string | null;
  personId: string | null;
  personName: string | null;
  assigneeId: string | null;
  sourceKey: string | null;
  cat: string;
  done: boolean;
};

export type ListRow = { id: string; name: string; builtin: string | null; showOnToday: boolean };
export type TouchRow = { personId: string; name: string; followUpDays: number; lastContact: string | null; assigneeId: string | null };
export type TeamMember = { id: string; name: string; initials: string; isOwner: boolean };

const taskInclude = { person: { select: { name: true } } } as const;
type DbTask = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

export function toRow(t: DbTask): TaskRow {
  return {
    id: t.id, virtual: false, title: t.title, notes: t.notes, kind: t.kind,
    due: t.dueDate ? isoFromDate(t.dueDate) : null, time: t.dueTime, repeat: t.repeat, priority: t.priority,
    subtasks: parseSubtasks(t.subtasks), listId: t.listId, personId: t.personId, personName: t.person?.name ?? null,
    assigneeId: t.assigneeId, sourceKey: t.sourceKey, cat: categoryOf(t), done: !!t.completedAt,
  };
}

export async function loadTeam(): Promise<TeamMember[]> {
  const users = await db.user.findMany({ where: { status: { not: "DISABLED" } }, orderBy: [{ isOwner: "desc" }, { name: "asc" }] });
  return users.map((u) => ({ id: u.id, name: u.name, initials: initials(u.name), isOwner: u.isOwner }));
}

/** Important dates tasks for everyone not in Trash, minus the ones already saved (checked off, edited or deleted). */
export async function loadDateTasks(team: TeamMember[], today: string, personId?: string): Promise<TaskRow[]> {
  const [dates, reminders] = await Promise.all([
    db.importantDate.findMany({ where: { person: { deletedAt: null, ...(personId ? { id: personId } : {}) } }, include: { person: { select: { name: true, assignedToId: true, stage: { select: { name: true } } } } } }),
    db.dateReminder.findMany({ orderBy: { position: "asc" } }),
  ]);
  const computed = importantDateTasks(
    dates.map((d) => ({ id: d.id, kind: d.kind, whose: d.whose, date: isoFromDate(d.date), personId: d.personId, personName: d.person.name, stage: d.person.stage?.name ?? null, assignedToId: d.person.assignedToId })),
    reminders, team, today,
  );
  if (!computed.length) return [];
  const saved = new Set((await db.task.findMany({ where: { sourceKey: { in: computed.map((c) => c.key) } }, select: { sourceKey: true } })).map((t) => t.sourceKey));
  return computed.filter((c) => !saved.has(c.key)).map((c) => ({
    id: c.key, virtual: true, title: c.title, notes: "", kind: c.kind, due: c.due, time: null, repeat: null, priority: 0, subtasks: [],
    listId: null, personId: c.personId, personName: c.personName, assigneeId: c.assigneeId, sourceKey: c.key, cat: "dates", done: false,
  }));
}

export async function loadTaskBoard() {
  const today = isoFromDate(todayCentral());
  const team = await loadTeam();
  const [lists, tasks, dateTasks, people] = await Promise.all([
    db.taskList.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }] }),
    db.task.findMany({ where: { completedAt: null, deletedAt: null, OR: [{ personId: null }, { person: { deletedAt: null } }] }, include: taskInclude, orderBy: [{ dueDate: "asc" }, { priority: "desc" }, { dueTime: "asc" }] }),
    loadDateTasks(team, today),
    db.person.findMany({ where: { deletedAt: null, followUpDays: { gt: 0 } }, select: { id: true, name: true, followUpDays: true, lastContactAt: true, assignedToId: true } }),
  ]);
  const touches: TouchRow[] = people
    .filter((p) => isDueForTouch(p))
    .map((p) => ({ personId: p.id, name: p.name, followUpDays: p.followUpDays!, lastContact: p.lastContactAt ? p.lastContactAt.toISOString() : null, assigneeId: p.assignedToId }))
    .sort((a, b) => (a.lastContact ?? "").localeCompare(b.lastContact ?? ""));
  return {
    today, team, touches,
    lists: lists.map((l): ListRow => ({ id: l.id, name: l.name, builtin: l.builtin, showOnToday: l.showOnToday })),
    tasks: [...tasks.map(toRow), ...dateTasks],
  };
}

/** Open tasks for one person, soonest first (contact page Tasks card). */
export async function loadPersonTasks(personId: string) {
  const today = isoFromDate(todayCentral());
  const [tasks, team] = await Promise.all([
    db.task.findMany({ where: { personId, completedAt: null, deletedAt: null }, include: taskInclude }),
    loadTeam(),
  ]);
  const rows = tasks.map(toRow).sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || (a.time ?? "99").localeCompare(b.time ?? "99"));
  return { today, team, rows };
}
