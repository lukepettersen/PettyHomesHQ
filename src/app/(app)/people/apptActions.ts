"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { guarded, UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { runTrigger } from "@/server/automation";
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
    revalidatePath(`/people/${v.personId}`); revalidatePath("/tasks");
    return result;
  });
}

export async function deleteAppointment(id: string) {
  return guarded(null, async (user) => {
    const a = await db.appointment.update({ where: { id: z.string().min(1).max(40).parse(id), deletedAt: null }, data: { deletedAt: new Date() } });
    await logActivity(user.id, "delete", "appointment", a.id, `Deleted appointment "${a.title}"`);
    revalidatePath(`/people/${a.personId}`);
  });
}
