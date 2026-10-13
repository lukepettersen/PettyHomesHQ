"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { guarded, UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { runTrigger } from "@/server/automation";
import { syncAppointment } from "@/server/google";
import { dateFromIso, isoFromDate, todayCentral } from "@/lib/normalize";
import { formatTime, longIso } from "@/lib/tasks";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a time").nullable();
const bookSchema = z.object({
  personId: z.string().min(1).max(40),
  type: z.enum(["call", "buyer", "seller", "showing", "other"]),
  title: z.string().trim().min(1, "Give the appointment a name").max(160).refine((t) => !/-\s*$/.test(t), "Give the appointment a name"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  start: time, end: time,
  location: z.string().trim().max(300).default(""),
  invitees: z.array(z.string().trim().min(1).max(120)).max(20),
});

/** Book an appointment. A phone call also starts the "phone call booked" templates and is logged on the timeline. */
export async function bookAppointment(input: z.input<typeof bookSchema>) {
  return guarded(null, async (user) => {
    const v = bookSchema.parse(input);
    if (v.start && v.end && v.end <= v.start) throw new UserError("The end time is before the start.");
    const person = await db.person.findFirst({ where: { id: v.personId, deletedAt: null }, select: { id: true, name: true } });
    if (!person) throw new UserError("That person was deleted.");
    const when = `${longIso(v.date)}${v.start ? ` ${formatTime(v.start)}` : ""}`;
    const result = await db.$transaction(async (tx) => {
      const a = await tx.appointment.create({ data: { personId: v.personId, type: v.type, title: v.title, date: dateFromIso(v.date), start: v.start, end: v.end, location: v.location, invitees: v.invitees, createdById: user.id } });
      let tasks = 0;
      if (v.type === "call") {
        tasks = await runTrigger(tx, "phonecall", { personId: v.personId, start: isoFromDate(todayCentral()), dates: { phoneCall: v.date }, times: { phoneCall: v.start } }, user.id);
        await tx.timelineEntry.create({ data: { personId: v.personId, kind: "system", body: `Phone call booked for ${when}`, authorId: user.id } });
      }
      return { id: a.id, tasks };
    });
    await logActivity(user.id, "create", "appointment", result.id, `Booked "${v.title}" for ${when}${result.tasks ? ` (${result.tasks} tasks)` : ""}`);
    await syncAppointment(result.id); // Google Calendar, when connected
    revalidatePath(`/people/${v.personId}`); revalidatePath("/tasks");
    return result;
  });
}

export async function deleteAppointment(id: string) {
  return guarded(null, async (user) => {
    const a = await db.appointment.update({ where: { id: z.string().min(1).max(40).parse(id), deletedAt: null }, data: { deletedAt: new Date() } });
    await logActivity(user.id, "delete", "appointment", a.id, `Deleted appointment "${a.title}"`);
    await syncAppointment(a.id);
    revalidatePath(`/people/${a.personId}`);
  });
}

const editSchema = bookSchema.omit({ personId: true, type: true }).extend({ id: z.string().min(1).max(40) });

/** Edit an appointment's title, date, times, location or invitees. */
export async function updateAppointment(input: z.input<typeof editSchema>) {
  return guarded(null, async (user) => {
    const v = editSchema.parse(input);
    if (v.start && v.end && v.end <= v.start) throw new UserError("The end time is before the start.");
    const before = await db.appointment.findFirst({ where: { id: v.id, deletedAt: null } });
    if (!before) throw new UserError("That appointment was deleted.");
    const a = await db.appointment.update({ where: { id: v.id }, data: { title: v.title, date: dateFromIso(v.date), start: v.start, end: v.end, location: v.location, invitees: v.invitees } });
    const moved = isoFromDate(before.date) !== v.date || before.start !== v.start;
    // A moved call re-dates the open steps timed from it.
    if (moved && a.type === "call") {
      const open = await db.task.findMany({ where: { personId: a.personId, anchor: "phoneCall", completedAt: null, deletedAt: null } });
      for (const t of open) await db.task.update({ where: { id: t.id }, data: { dueDate: new Date(dateFromIso(v.date).getTime() + (t.offsetDays ?? 0) * 86400000), ...(t.offsetDays === 0 && t.dueTime ? { dueTime: v.start } : {}) } });
    }
    await syncAppointment(a.id);
    await logActivity(user.id, "update", "appointment", a.id, `Updated appointment "${a.title}"${moved ? ` (now ${longIso(v.date)}${v.start ? ` ${formatTime(v.start)}` : ""})` : ""}`);
    revalidatePath(`/people/${a.personId}`); revalidatePath("/tasks");
  });
}
