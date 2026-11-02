import "server-only";
import { db } from "@/server/db";
import { logActivity } from "@/server/activity";
import { redateConsult, restartConsultSteps, runTrigger } from "@/server/automation";
import { syncAppointment } from "@/server/google";
import { dateFromIso, isoFromDate, todayCentral } from "@/lib/normalize";
import { formatTime, longIso } from "@/lib/tasks";

export type BookInput = { personId: string; type: string; title: string; date: string; start: string | null; end: string | null; location: string; invitees: string[];
  /** A buyer/seller consult for someone without that kind of deal also starts one at "Consult scheduled" (booked by text, owner request 2026-11-02). */
  startFile?: boolean };

/**
 * Books an appointment (already checked): saves it, starts the phone call / consult checklists, logs it and sends the
 * Google Calendar invite. Used by the Book button and by booking a consult by text (owner request 2026-10-30).
 */
export async function bookAppt(userId: string, v: BookInput): Promise<{ id: string; tasks: number; started: string | null }> {
  const when = `${longIso(v.date)}${v.start ? ` ${formatTime(v.start)}` : ""}`;
  const result = await db.$transaction(async (tx) => {
    const a = await tx.appointment.create({ data: { personId: v.personId, type: v.type, title: v.title, date: dateFromIso(v.date), start: v.start, end: v.end, location: v.location, invitees: v.invitees, createdById: userId } });
    let tasks = 0, started: string | null = null;
    if (v.type === "call") {
      tasks = await runTrigger(tx, "phonecall", { personId: v.personId, start: isoFromDate(todayCentral()), dates: { phoneCall: v.date }, times: { phoneCall: v.start } }, userId);
      await tx.timelineEntry.create({ data: { personId: v.personId, kind: "system", body: `Phone call booked for ${when}`, authorId: userId } });
    }
    if (v.type === "buyer" || v.type === "seller") {
      // Templates that start when a consultation is booked; linked to their active file when there is one.
      const kind = v.type === "buyer" ? "buyer" : "listing";
      let file = await tx.clientFile.findFirst({ where: { personId: v.personId, kind, deletedAt: null, closedAt: null }, orderBy: { createdAt: "desc" } });
      if (!file && v.startFile) { file = await startAtConsult(tx, v, kind, userId); started = kind; }
      const ctx = { personId: v.personId, fileId: file?.id ?? null, start: isoFromDate(todayCentral()), dates: { consult: v.date }, times: { consult: v.start } };
      tasks = await runTrigger(tx, `${v.type}consult`, ctx, userId);
      await redateConsult(tx, v.personId);
      tasks += await restartConsultSteps(tx, `${v.type}consult`, ctx, userId);
    }
    return { id: a.id, tasks, started };
  });
  await logActivity(userId, "create", "appointment", result.id, `Booked "${v.title}" for ${when}${result.tasks ? ` (${result.tasks} tasks)` : ""}${result.started ? ` and started a ${result.started === "buyer" ? "buyer" : "listing"} at Consult scheduled` : ""}`);
  await syncAppointment(result.id); // Google Calendar, when connected
  return result;
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
/** Starts a buyer/listing at "Consult scheduled" (else its first stage) with the consult date filled in, tags them
 *  Buyer or Seller and starts that stage's checklist, the same as + Add buyer / + Add seller. */
async function startAtConsult(tx: Tx, v: BookInput, kind: "buyer" | "listing", userId: string) {
  const stages = await tx.pipelineStatus.findMany({ where: { kind }, orderBy: { position: "asc" } });
  const status = stages.find((s) => /^consult scheduled$/i.test(s.name.trim())) ?? stages[0];
  if (!status) return null;
  const f = await tx.clientFile.create({ data: { personId: v.personId, kind, statusId: status.id, info: { consult: v.start ? `${v.date}T${v.start}` : v.date }, createdById: userId } });
  const tagName = kind === "buyer" ? "Buyer" : "Seller";
  const tag = await tx.tag.upsert({ where: { name: tagName }, update: {}, create: { name: tagName } });
  await tx.personTag.upsert({ where: { personId_tagId: { personId: v.personId, tagId: tag.id } }, update: {}, create: { personId: v.personId, tagId: tag.id } });
  await tx.timelineEntry.create({ data: { personId: v.personId, kind: "system", body: `Started a ${kind === "buyer" ? "buyer" : "listing"} at ${status.name} (consult booked)`, authorId: userId } });
  await runTrigger(tx, `status:${status.id}`, { personId: v.personId, fileId: f.id, start: isoFromDate(todayCentral()), facts: {} }, userId);
  return f;
}
