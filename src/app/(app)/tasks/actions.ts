"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { guarded, UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { notifyAssigned } from "@/server/notifications";
import { findOrCreateList, quickAdd } from "@/server/quickAdd";
import { loadDateTasks, loadTeam } from "@/server/tasks";
import { isDueForTouch } from "@/lib/filters";
import { applyTemplate, contractAnchors, factsOf, loadTemplates, moveFile } from "@/server/automation";
import { dateFromIso, isoFromDate, todayCentral } from "@/lib/normalize";
import { categoryOf, longIso, nextDue, parseQuickAdd, parseTime, stripPersonWord, workdays, type Repeat } from "@/lib/tasks";

const id = z.string().trim().min(1).max(200);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const repeatSchema = z.enum(["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "YEARLY"]).nullable();
const kindSchema = z.enum(["task", "followup", "call", "text", "email", "showing", "closing", "other"]);
const listName = z.string().trim().min(1, "Give the list a name").max(60);
const timeSchema = z.string().trim().max(20).transform((v, ctx) => {
  if (!v) return null;
  const t = parseTime(v);
  if (!t) { ctx.addIssue({ code: "custom", message: `"${v}" isn't a time. Try 9am or 2:30pm.` }); return z.NEVER; }
  return t;
});

function refresh(personId?: string | null) {
  revalidatePath("/tasks");
  if (personId) revalidatePath(`/people/${personId}`);
}

// ---------- Quick add ----------
const quickSchema = z.object({ text: z.string().trim().min(1, "Type a task first").max(300), view: z.string().max(60).default("today"), assigneeId: z.string().max(40).nullish() });

export async function quickAddTask(input: z.input<typeof quickSchema>) {
  return guarded(null, async (user) => quickAdd(user, quickSchema.parse(input)));
}

// ---------- Create task pop-up (contact page) ----------
const createSchema = z.object({
  title: z.string().trim().min(1, "Give the task a name").max(300),
  kind: kindSchema.default("followup"),
  personId: id.nullable(),
  assigneeId: id.nullable(),
  due: isoDate,
  time: timeSchema,
});

export async function createTask(input: z.input<typeof createSchema>) {
  return guarded(null, async (user) => {
    const v = createSchema.parse(input);
    if (v.personId && !(await db.person.findFirst({ where: { id: v.personId, deletedAt: null } }))) throw new UserError("That person was deleted.");
    const t = await db.task.create({ data: { title: v.title, kind: v.kind, personId: v.personId, assigneeId: v.assigneeId, dueDate: dateFromIso(v.due), dueTime: v.time, createdById: user.id } });
    await logActivity(user.id, "create", "task", t.id, `Added task "${v.title}"`);
    if (v.assigneeId && v.assigneeId !== user.id) await notifyAssigned(user, t.id);
    refresh(v.personId);
    return { id: t.id };
  });
}

// ---------- Complete / reopen ----------
export async function completeTask(taskId: string) {
  return guarded(null, async (user) => {
    const t = await db.task.findFirst({ where: { id: id.parse(taskId), deletedAt: null } });
    if (!t) throw new UserError("That task was deleted.");
    if (t.completedAt) return { nextId: null as string | null, movedTo: null as string | null };
    let nextId: string | null = null;
    await db.$transaction(async (tx) => {
      await tx.task.update({ where: { id: t.id }, data: { completedAt: new Date() } });
      // A text task checked off is logged as a text (Texts filter, last text); other tasks as "Task done".
      if (t.personId) await tx.timelineEntry.create({ data: { personId: t.personId, kind: t.kind === "text" ? "text" : "task", body: t.title, taskId: t.id, authorId: user.id } });
      // Checking off a text task means they were texted: it restarts their follow-up ("Due for a touch").
      if (t.personId && t.kind === "text") await tx.person.update({ where: { id: t.personId }, data: { lastTextAt: new Date(), lastContactAt: new Date() } });
      if (t.repeat) {
        const from = t.dueDate ? isoFromDate(t.dueDate) : isoFromDate(todayCentral());
        const n = await tx.task.create({
          data: {
            title: t.title, notes: t.notes, kind: t.kind, dueDate: dateFromIso(nextDue(from, t.repeat as Repeat)), dueTime: t.dueTime, repeat: t.repeat, priority: t.priority,
            subtasks: (Array.isArray(t.subtasks) ? t.subtasks : []).map((s) => ({ ...(s as object), done: false })), listId: t.listId, personId: t.personId, assigneeId: t.assigneeId, createdById: user.id,
          },
        });
        nextId = n.id;
      }
    });
    await logActivity(user.id, "update", "task", t.id, `Completed "${t.title}"`);
    // A checklist step marked "When done: move deal to…" moves the file (SPEC.md §7.1).
    let movedTo: string | null = null;
    if (t.advanceStatusId && t.fileId) {
      const file = await db.clientFile.findFirst({ where: { id: t.fileId, deletedAt: null, closedAt: null }, include: { contracts: { where: { state: "active", deletedAt: null }, select: { id: true } } } });
      const status = await db.pipelineStatus.findUnique({ where: { id: t.advanceStatusId } });
      if (file && status && file.statusId !== status.id && !file.contracts.length && status.kind === file.kind) {
        await moveFile(file.id, status.id, user.id);
        await logActivity(user.id, "update", "clientFile", file.id, `Moved to ${status.name} when "${t.title}" was done`);
        movedTo = status.name;
        revalidatePath("/pipeline");
      }
    }
    refresh(t.personId);
    return { nextId, movedTo };
  });
}

export async function reopenTask(input: { id: string; nextId?: string | null }) {
  return guarded(null, async (user) => {
    const t = await db.task.update({ where: { id: id.parse(input.id), deletedAt: null }, data: { completedAt: null } });
    // Unchecking takes it back off the timeline.
    await db.timelineEntry.updateMany({ where: { taskId: t.id, kind: { in: ["task", "text"] }, deletedAt: null }, data: { deletedAt: new Date() } });
    // Undo also removes the next repeat that completing created, if it hasn't been touched.
    if (input.nextId) await db.task.updateMany({ where: { id: id.parse(input.nextId), completedAt: null, createdAt: { gte: new Date(Date.now() - 6 * 3600000) } }, data: { deletedAt: new Date() } });
    await logActivity(user.id, "update", "task", t.id, `Reopened "${t.title}"`);
    refresh(t.personId);
  });
}

/** Important dates tasks exist only as rules until someone checks one off or edits it; then a row is saved. */
async function materializeDateTask(key: string, userId: string) {
  const existing = await db.task.findUnique({ where: { sourceKey: key } });
  if (existing) return existing;
  const [, dateId] = key.split(":");
  const date = await db.importantDate.findUnique({ where: { id: dateId } });
  if (!date) throw new UserError("That date was removed.");
  const today = isoFromDate(todayCentral());
  const virtual = (await loadDateTasks(await loadTeam(), today, date.personId)).find((t) => t.id === key);
  if (!virtual) throw new UserError("That reminder no longer applies. Refresh the page.");
  return db.task.create({
    data: { title: virtual.title, kind: virtual.kind, dueDate: dateFromIso(virtual.due!), personId: virtual.personId, assigneeId: virtual.assigneeId, sourceKey: key, createdById: userId },
  });
}

export async function completeDateTask(key: string) {
  return guarded(null, async (user) => {
    const t = await materializeDateTask(z.string().regex(/^date:[\w-]+:[\w-]+:\d{4}$/).parse(key), user.id);
    await db.$transaction([
      db.task.update({ where: { id: t.id }, data: { completedAt: new Date(), deletedAt: null } }),
      ...(t.personId ? [db.timelineEntry.create({ data: { personId: t.personId, kind: t.kind === "text" ? "text" : "task", body: t.title, taskId: t.id, authorId: user.id } })] : []),
      // "Text Happy Birthday" checked off: they were texted, so their follow-up restarts.
      ...(t.personId && t.kind === "text" ? [db.person.update({ where: { id: t.personId }, data: { lastTextAt: new Date(), lastContactAt: new Date() } })] : []),
    ]);
    await logActivity(user.id, "update", "task", t.id, `Completed "${t.title}"`);
    refresh(t.personId);
    return { id: t.id };
  });
}

// ---------- Task details ----------
const updateSchema = z.object({
  id,
  title: z.string().trim().min(1, "The task needs a title").max(300),
  notes: z.string().max(5000).default(""),
  due: isoDate.nullable(),
  time: timeSchema,
  repeat: repeatSchema,
  priority: z.number().int().min(0).max(3),
  listId: id.nullable(),
  assigneeId: id.nullable(),
  subtasks: z.array(z.object({ title: z.string().trim().min(1).max(200), done: z.boolean() })).max(50),
});

export async function updateTask(input: z.input<typeof updateSchema>) {
  return guarded(null, async (user) => {
    const v = updateSchema.parse(input);
    const before = v.id.startsWith("date:") ? await materializeDateTask(v.id, user.id) : await db.task.findFirst({ where: { id: v.id, deletedAt: null } });
    if (!before) throw new UserError("That task was deleted.");
    if (v.listId && !(await db.taskList.findFirst({ where: { id: v.listId, builtin: null } }))) throw new UserError("That list was deleted.");
    // A step timed from a date (Closing + 1 day…) can be given its own date; from then on it stays put instead of
    // moving when that date changes (owner request 2026-10-21).
    const due = v.due ? dateFromIso(v.due) : null;
    const dateChanged = (before.dueDate?.getTime() ?? 0) !== (due?.getTime() ?? 0);
    const detach = dateChanged && !!before.anchor ? { anchor: null, offsetDays: null, offsetMinutes: null } : {};
    const t = await db.task.update({
      where: { id: before.id },
      data: { title: v.title, notes: v.notes, dueDate: due, dueTime: v.time, repeat: v.repeat, priority: v.priority, listId: v.listId, assigneeId: v.assigneeId, subtasks: v.subtasks, ...detach },
    });
    const changed = [before.title !== t.title && "title", (before.dueDate?.getTime() ?? 0) !== (t.dueDate?.getTime() ?? 0) && "due date", before.assigneeId !== t.assigneeId && "assignee", before.listId !== t.listId && "list", before.repeat !== t.repeat && "repeat"].filter(Boolean);
    await logActivity(user.id, "update", "task", t.id, `Updated "${t.title}"${changed.length ? ` (${changed.join(", ")})` : ""}`);
    if (t.assigneeId && before.assigneeId !== t.assigneeId && t.assigneeId !== user.id) await notifyAssigned(user, t.id);
    refresh(t.personId);
    return { id: t.id };
  });
}

export async function deleteTask(taskId: string) {
  return guarded(null, async (user) => {
    const key = id.parse(taskId);
    const t = key.startsWith("date:") ? await materializeDateTask(key, user.id) : await db.task.findFirst({ where: { id: key, deletedAt: null } });
    if (!t) throw new UserError("That task was already deleted.");
    await db.task.update({ where: { id: t.id }, data: { deletedAt: new Date() } });
    await logActivity(user.id, "delete", "task", t.id, `Moved task "${t.title}" to Trash`);
    refresh(t.personId);
  });
}

// ---------- Due for a touch ----------
export async function logTouch(personId: string) {
  return guarded(null, async (user) => {
    const p = await db.person.findFirst({ where: { id: id.parse(personId), deletedAt: null } });
    if (!p) throw new UserError("That person was deleted.");
    await db.$transaction([
      db.timelineEntry.create({ data: { personId: p.id, kind: "text", body: "Text logged from Tasks (Due for a touch)", authorId: user.id } }),
      db.person.update({ where: { id: p.id }, data: { lastContactAt: new Date(), lastTextAt: new Date() } }),
    ]);
    await logActivity(user.id, "create", "timeline", p.id, `Logged a text for ${p.name} (Due for a touch)`);
    refresh(p.id);
    revalidatePath("/people");
    return { name: p.name, followUpDays: p.followUpDays };
  });
}

// ---------- Spread out Due for a touch ----------
const spreadSchema = z.object({ perDay: z.coerce.number().int().min(1, "At least 1 a day").max(100) });

/** Everyone due gets a weekday to show up: the first few today (or Monday), the next few the next weekday, and so on. No fake texts. */
export async function spreadTouches(input: z.input<typeof spreadSchema>) {
  return guarded(null, async (user) => {
    const { perDay } = spreadSchema.parse(input);
    const people = await db.person.findMany({ where: { deletedAt: null, followUpDays: { gt: 0 } }, select: { id: true, followUpDays: true, lastTextAt: true, touchAfter: true } });
    // Everyone due, including people an earlier Spread out is holding back, so it can be re-spread in one go.
    // Same order as the list: never texted first, then the longest since the last text.
    const due = people.filter((p) => isDueForTouch({ ...p, touchAfter: null })).sort((a, b) => (a.lastTextAt?.getTime() ?? 0) - (b.lastTextAt?.getTime() ?? 0));
    if (!due.length) throw new UserError("No one is due for a touch right now.");
    const today = todayCentral();
    // Weekdays only: on a weekend the first batch waits for Monday.
    const dates = workdays(today, Math.ceil(due.length / perDay));
    const days = dates.length;
    await db.$transaction(dates.map((day, d) => db.person.updateMany({
      where: { id: { in: due.slice(d * perDay, (d + 1) * perDay).map((p) => p.id) } },
      data: { touchAfter: day.getTime() === today.getTime() ? null : day },
    })));
    await logActivity(user.id, "update", "person", "touches", `Spread out Due for a touch: ${due.length} people, ${perDay} a day over ${days} days`);
    refresh();
    revalidatePath("/people");
    return { people: due.length, days, lastDay: isoFromDate(dates[days - 1]) };
  });
}

/** Undo Spread out: everyone held back shows up again right away. */
export async function unspreadTouches() {
  return guarded(null, async (user) => {
    const r = await db.person.updateMany({ where: { touchAfter: { not: null } }, data: { touchAfter: null } });
    await logActivity(user.id, "update", "person", "touches", `Undid Spread out on Due for a touch (${r.count} people)`);
    refresh();
    revalidatePath("/people");
    return { count: r.count };
  });
}

// ---------- Lists ----------
export async function createList(name: string) {
  return guarded(null, async (user) => {
    const { list, created } = await findOrCreateList(listName.parse(name));
    if (!created) throw new UserError(`There's already a list called "${list.name}".`);
    await logActivity(user.id, "create", "taskList", list.id, `Created task list "${list.name}"`);
    refresh();
    return { id: list.id, name: list.name };
  });
}

export async function renameList(input: { id: string; name: string }) {
  return guarded(null, async (user) => {
    const name = listName.parse(input.name);
    const list = await db.taskList.findFirst({ where: { id: id.parse(input.id), builtin: null } });
    if (!list) throw new UserError("That list was deleted.");
    if (await db.taskList.findFirst({ where: { name: { equals: name, mode: "insensitive" }, NOT: { id: list.id } } })) throw new UserError(`There's already a list called "${name}".`);
    await db.taskList.update({ where: { id: list.id }, data: { name } });
    await logActivity(user.id, "update", "taskList", list.id, `Renamed task list "${list.name}" to "${name}"`);
    refresh();
  });
}

export async function deleteList(listId: string) {
  return guarded(null, async (user) => {
    const list = await db.taskList.findFirst({ where: { id: id.parse(listId), builtin: null } });
    if (!list) throw new UserError("Built-in lists can't be deleted.");
    await db.taskList.delete({ where: { id: list.id } }); // tasks are kept; they fall back to Clients or Misc
    await logActivity(user.id, "delete", "taskList", list.id, `Deleted task list "${list.name}" (tasks kept)`);
    refresh();
  });
}

const orderSchema = z.object({
  rows: z.array(z.object({ id: id.nullable(), name: listName, showOnToday: z.boolean() })).max(100),
  deleted: z.array(id).max(100),
});

/** Edit columns: order, On Today, renames, new lists and deletions, saved together. */
export async function saveListOrder(input: z.input<typeof orderSchema>) {
  return guarded(null, async (user) => {
    const v = orderSchema.parse(input);
    const names = v.rows.map((r) => r.name.toLowerCase());
    if (new Set(names).size !== names.length) throw new UserError("Two lists have the same name.");
    const all = await db.taskList.findMany();
    const byId = new Map(all.map((l) => [l.id, l]));
    for (const d of v.deleted) if (byId.get(d)?.builtin) throw new UserError("Built-in lists can't be deleted.");
    await db.$transaction(async (tx) => {
      if (v.deleted.length) await tx.taskList.deleteMany({ where: { id: { in: v.deleted }, builtin: null } });
      // Park names first so swapping two names doesn't trip the unique rule.
      for (const r of v.rows) if (r.id && byId.has(r.id) && !byId.get(r.id)!.builtin) await tx.taskList.update({ where: { id: r.id }, data: { name: `__${r.id}` } });
      for (const [position, r] of v.rows.entries()) {
        const existing = r.id ? byId.get(r.id) : undefined;
        if (existing) await tx.taskList.update({ where: { id: existing.id }, data: { position, showOnToday: r.showOnToday, ...(existing.builtin ? {} : { name: r.name }) } });
        else await tx.taskList.create({ data: { name: r.name, position, showOnToday: r.showOnToday } });
      }
    });
    await logActivity(user.id, "update", "taskList", null, `Saved task list order (${v.rows.length} lists${v.deleted.length ? `, ${v.deleted.length} deleted` : ""})`);
    refresh();
  });
}

export async function setListOnToday(input: { id: string; on: boolean }) {
  return guarded(null, async (user) => {
    const l = await db.taskList.update({ where: { id: id.parse(input.id) }, data: { showOnToday: !!input.on } });
    await logActivity(user.id, "update", "taskList", l.id, `${input.on ? "Showed" : "Hid"} "${l.name}" on Today`);
    refresh();
  });
}

// ---------- Apply a template by hand (contact page → Tasks card) ----------
const applySchema = z.object({ personId: id, templateId: id, start: isoDate, fileId: id.nullable() });

export async function applyTemplateToPerson(input: z.input<typeof applySchema>) {
  return guarded(null, async (user) => {
    const v = applySchema.parse(input);
    const person = await db.person.findFirst({ where: { id: v.personId, deletedAt: null }, select: { id: true, name: true } });
    if (!person) throw new UserError("That person was deleted.");
    const t = (await loadTemplates()).find((x) => x.id === v.templateId);
    if (!t) throw new UserError("That template was deleted.");
    // Linked to a file, contract-date steps use its active contract's dates.
    const file = v.fileId ? await db.clientFile.findFirst({ where: { id: v.fileId, personId: v.personId, deletedAt: null }, include: { contracts: { where: { state: "active", deletedAt: null } } } }) : null;
    const pa = file?.contracts[0];
    const n = await db.$transaction((tx) => applyTemplate(tx, t, {
      personId: person.id, fileId: file?.id ?? null, paId: pa?.id ?? null, start: v.start,
      dates: pa ? contractAnchors(pa) : {}, facts: factsOf(pa ? pa.answers : file?.info),
    }, user.id));
    await logActivity(user.id, "create", "task", null, `Applied template "${t.name}" to ${person.name} (${n} tasks)`);
    refresh(person.id);
    return { count: n, name: t.name };
  });
}
