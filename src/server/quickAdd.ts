import "server-only";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { notifyAssigned } from "@/server/notifications";
import { loadTeam } from "@/server/tasks";
import { dateFromIso, isoFromDate, todayCentral } from "@/lib/normalize";
import { categoryOf, longIso, parseQuickAdd, stripPersonWord, type Repeat } from "@/lib/tasks";

// Quick add (Tasks box, and texts starting with "task" from a team member's cell). Callers check who's asking.

export function refreshTasks(personId?: string | null) {
  revalidatePath("/tasks");
  if (personId) revalidatePath(`/people/${personId}`);
}

async function listNameFor(cat: string) {
  if (!cat.startsWith("list:")) return { clients: "Clients", recurring: "Recurring", dates: "Important dates", misc: "Misc" }[cat] ?? cat;
  return (await db.taskList.findUnique({ where: { id: cat.slice(5) } }))?.name ?? "a list";
}

export async function findOrCreateList(name: string) {
  const existing = await db.taskList.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (existing) {
    if (existing.builtin) throw new UserError(`"${existing.name}" is a built-in list. Pick another name.`);
    return { list: existing, created: false };
  }
  const max = await db.taskList.aggregate({ _max: { position: true } });
  const list = await db.taskList.create({ data: { name: name[0].toUpperCase() + name.slice(1), position: (max._max.position ?? 0) + 1 } });
  return { list, created: true };
}

/** Parses quick-add words (dates, times, @name, re Name, #list) and saves the task. */
export async function quickAdd(user: { id: string; name: string }, v: { text: string; view: string; assigneeId?: string | null }) {
  const today = isoFromDate(todayCentral());
  const p = parseQuickAdd(v.text, today);
  let title = p.title;
  const notes: string[] = [];

  let personId: string | null = null, personName = "";
  if (p.personWord) {
    const hit = await db.person.findFirst({
      where: { deletedAt: null, name: { contains: p.personWord, mode: "insensitive" } },
      orderBy: { updatedAt: "desc" }, select: { id: true, name: true },
    });
    if (hit && new RegExp(`\\b${p.personWord}\\b`, "i").test(hit.name)) {
      personId = hit.id; personName = hit.name;
      title = stripPersonWord(title, p.personWord);
    }
  }

  // Who it's for: an @name in the text, else the teammate whose tasks are on screen, else whoever typed it.
  let assigneeId = user.id, forName = "";
  const team = await loadTeam();
  if (p.assignee && p.assignee !== "me") {
    const m = team.find((t) => t.name.toLowerCase().split(/\s+/)[0] === p.assignee || (p.assignee === "assistant" && !t.isOwner));
    if (m) assigneeId = m.id; else notes.push(`no team member called @${p.assignee}`);
  } else if (!p.assignee && v.assigneeId) {
    const m = team.find((t) => t.id === v.assigneeId);
    if (m) assigneeId = m.id;
  }
  if (assigneeId !== user.id) forName = team.find((t) => t.id === assigneeId)?.name.split(/\s+/)[0] ?? "";

  let listId: string | null = null;
  if (p.list) {
    const { list, created } = await findOrCreateList(p.list);
    listId = list.id;
    if (created) notes.push(`created the list "${list.name}"`);
  } else if (v.view.startsWith("list:")) listId = v.view.slice(5);

  const repeat: Repeat | null = p.repeat ?? (v.view === "recurring" ? "WEEKLY" : null);
  if (!title) throw new UserError("Add a few words for the task.");
  const due = p.due ?? today;
  const t = await db.task.create({
    data: { title, dueDate: dateFromIso(due), dueTime: p.time ?? null, repeat, priority: p.priority ?? 0, listId, personId, assigneeId, createdById: user.id },
  });
  await logActivity(user.id, "create", "task", t.id, `Added task "${title}"${personName ? ` for ${personName}` : ""}`);
  if (assigneeId !== user.id) await notifyAssigned(user, t.id);
  refreshTasks(personId);

  if (v.view === "recurring" && !p.repeat) notes.push("repeats weekly (change it in the task)");
  if (v.view === "clients" && !personId) notes.push(p.personWord ? `no one matched "${p.personWord}"` : 'use "re" and a name to link a client');
  const where = await listNameFor(categoryOf(t));
  return { id: t.id, message: `Added "${title}"${forName ? ` for ${forName}` : ""} to ${where}, due ${longIso(due)}${notes.length ? `; ${notes.join("; ")}` : ""}.` };
}
