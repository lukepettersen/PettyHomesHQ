import "server-only";
import { db } from "@/server/db";
import { logActivity } from "@/server/activity";
import { redateConsult, restartConsultSteps, runTrigger } from "@/server/automation";
import { syncAppointment } from "@/server/google";
import { dateFromIso, isoFromDate, todayCentral } from "@/lib/normalize";
import { formatTime, longIso } from "@/lib/tasks";

export type BookInput = { personId: string; type: string; title: string; date: string; start: string | null; end: string | null; location: string; invitees: string[] };

/**
 * Books an appointment (already checked): saves it, starts the phone call / consult checklists, logs it and sends the
 * Google Calendar invite. Used by the Book button and by booking a consult by text (owner request 2026-10-30).
 */
export async function bookAppt(userId: string, v: BookInput): Promise<{ id: string; tasks: number }> {
  const when = `${longIso(v.date)}${v.start ? ` ${formatTime(v.start)}` : ""}`;
  const result = await db.$transaction(async (tx) => {
    const a = await tx.appointment.create({ data: { personId: v.personId, type: v.type, title: v.title, date: dateFromIso(v.date), start: v.start, end: v.end, location: v.location, invitees: v.invitees, createdById: userId } });
    let tasks = 0;
    if (v.type === "call") {
      tasks = await runTrigger(tx, "phonecall", { personId: v.personId, start: isoFromDate(todayCentral()), dates: { phoneCall: v.date }, times: { phoneCall: v.start } }, userId);
      await tx.timelineEntry.create({ data: { personId: v.personId, kind: "system", body: `Phone call booked for ${when}`, authorId: userId } });
    }
    if (v.type === "buyer" || v.type === "seller") {
      // Templates that start when a consultation is booked; linked to their active file when there is one.
      const file = await tx.clientFile.findFirst({ where: { personId: v.personId, kind: v.type === "buyer" ? "buyer" : "listing", deletedAt: null, closedAt: null }, orderBy: { createdAt: "desc" } });
      const ctx = { personId: v.personId, fileId: file?.id ?? null, start: isoFromDate(todayCentral()), dates: { consult: v.date }, times: { consult: v.start } };
      tasks = await runTrigger(tx, `${v.type}consult`, ctx, userId);
      await redateConsult(tx, v.personId);
      tasks += await restartConsultSteps(tx, `${v.type}consult`, ctx, userId);
    }
    return { id: a.id, tasks };
  });
  await logActivity(userId, "create", "appointment", result.id, `Booked "${v.title}" for ${when}${result.tasks ? ` (${result.tasks} tasks)` : ""}`);
  await syncAppointment(result.id); // Google Calendar, when connected
  return result;
}
