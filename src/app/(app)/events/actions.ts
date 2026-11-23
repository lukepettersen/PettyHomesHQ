"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guarded, UserError } from "@/server/safe";
import {
  addAttendees, addInterest, saveSignupPage, setInterestTier, applyAssignments, createEvent, offerGame, previewAssignments, previewOffer, removeInterest, deleteEvent, deleteReminder, deleteSlot, deleteTemplate, fetchWolvesSchedule, importSlots, previewReminder, removeAttendee,
  saveReminder, saveSlot, saveTemplate, setEventSender, setSignup, updateAttendee, updateEvent,
} from "@/server/events";
import { readSlotCsv, STATUS_KEYS } from "@/lib/events";
import { saveOpenAlert, sendOpenAlert } from "@/server/eventAlerts";
import { centralToUtc } from "@/lib/scheduledText";

// Events (SPEC.md §6.7): everything needs the "Events" permission (Luke and Alyssa).
const id = z.string().trim().min(1).max(40);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a time");
const status = z.enum(STATUS_KEYS);
const field = z.object({ key: z.string().max(60).optional(), label: z.string().max(80), type: z.enum(["text", "long", "number", "select"]), options: z.union([z.string().max(2000), z.array(z.string().max(80)).max(30)]).optional(), required: z.boolean().optional() });
const fields = z.array(field).max(20);
const tplReminder = z.object({ name: z.string().max(80), body: z.string().max(1000), daysBefore: z.number().int().min(0).max(60), time: clock });
const answers = z.record(z.string().max(60), z.string().max(1000));
const refresh = (eventId?: string) => { revalidatePath("/events"); if (eventId) revalidatePath(`/events/${eventId}`); };

export async function saveEventTemplate(input: unknown) {
  return guarded("manageEvents", async (user) => {
    const v = z.object({ id: id.nullable().optional(), name: z.string().max(120), type: z.string().max(60), multiSlot: z.boolean(), doneLabel: z.string().max(40), location: z.string().max(200),
      intro: z.string().max(2000), waitlistLabel: z.string().max(60), offerText: z.string().max(1000), fields, reminders: z.array(tplReminder).max(10) }).parse(input);
    const saved = await saveTemplate(user.id, v);
    revalidatePath("/events/templates");
    return saved;
  });
}

export async function removeEventTemplate(templateId: string) {
  return guarded("manageEvents", async (user) => { await deleteTemplate(user.id, id.parse(templateId)); revalidatePath("/events/templates"); });
}

export async function newEvent(input: unknown) {
  return guarded("manageEvents", async (user) => {
    const v = z.object({ templateId: id.nullable(), name: z.string().max(120), date: isoDate.nullable(), time: clock.nullable() }).parse(input);
    const eventId = await createEvent(user.id, v);
    refresh();
    return eventId;
  });
}

export async function editEvent(eventId: string, input: unknown) {
  return guarded("manageEvents", async (user) => {
    const v = z.object({ name: z.string().max(120), type: z.string().max(60), location: z.string().max(200), notes: z.string().max(4000), intro: z.string().max(2000), doneLabel: z.string().max(40),
      fields, senderId: id.nullable(), waitlistLabel: z.string().max(60), offerText: z.string().max(1000) }).parse(input);
    await updateEvent(user.id, id.parse(eventId), v);
    refresh(eventId);
  });
}

export async function removeEvent(eventId: string) {
  return guarded("manageEvents", async (user) => { await deleteEvent(user.id, id.parse(eventId)); refresh(); });
}

const slot = z.object({ date: isoDate, time: clock.nullable(), title: z.string().max(120), opponent: z.string().max(120), location: z.string().max(200), details: z.string().max(500) });
export async function saveEventSlot(eventId: string, slotId: string | null, input: unknown) {
  return guarded("manageEvents", async (user) => { await saveSlot(user.id, id.parse(eventId), slotId ? id.parse(slotId) : null, slot.parse(input)); refresh(eventId); });
}
export async function removeEventSlot(eventId: string, slotId: string) {
  return guarded("manageEvents", async (user) => { await deleteSlot(user.id, id.parse(eventId), id.parse(slotId)); refresh(eventId); });
}

/** Pulls the Timberwolves' home games for a season from the NBA's public schedule. */
export async function importWolvesSchedule(eventId: string, season: string) {
  return guarded("manageEvents", async (user) => {
    const s = z.string().regex(/^20\d\d-\d\d$/, "Season like 2026-27").parse(season);
    const r = await importSlots(user.id, id.parse(eventId), await fetchWolvesSchedule(s), `NBA schedule ${s}`);
    refresh(eventId);
    return r;
  });
}

/** Dates from a spreadsheet (CSV): Date, Time, Opponent, Location, Seats. */
export async function importSlotCsv(eventId: string, csv: string, team: string) {
  return guarded("manageEvents", async (user) => {
    const text = z.string().max(500_000).parse(csv);
    const { slots, problem, skipped } = readSlotCsv(text, z.string().max(40).parse(team));
    if (problem) throw new UserError(problem);
    const r = await importSlots(user.id, id.parse(eventId), slots, "spreadsheet");
    refresh(eventId);
    return { ...r, skipped };
  });
}

export async function addEventAttendees(eventId: string, input: unknown) {
  return guarded("manageEvents", async (user) => {
    const v = z.object({ slotIds: z.array(id).min(1, "Pick at least one date.").max(200), personIds: z.array(id).min(1, "Pick at least one contact.").max(50), status, answers: answers.optional() }).parse(input);
    const n = await addAttendees(user.id, id.parse(eventId), v.slotIds, v.personIds, v.status, v.answers ?? {});
    refresh(eventId);
    return n;
  });
}

export async function editEventAttendee(eventId: string, attendeeId: string, input: unknown) {
  return guarded("manageEvents", async (user) => {
    const v = z.object({ status, answers }).parse(input);
    await updateAttendee(user.id, id.parse(attendeeId), v);
    refresh(eventId);
  });
}

export async function removeEventAttendee(eventId: string, attendeeId: string) {
  return guarded("manageEvents", async (user) => { await removeAttendee(user.id, id.parse(attendeeId)); refresh(eventId); });
}

const reminder = z.object({ name: z.string().max(80), body: z.string().max(1000), daysBefore: z.number().int().min(0).max(60), time: clock, statuses: z.array(status).min(1, "Pick who it goes to.").max(4), active: z.boolean(), addOwner: z.boolean().optional() });
export async function saveEventReminder(eventId: string, reminderId: string | null, input: unknown) {
  return guarded("manageEvents", async (user) => {
    const v = reminder.parse(input);
    const [h, m] = v.time.split(":").map(Number);
    if (h < 8 || h > 20 || (h === 20 && m > 0)) throw new UserError("Reminders go out between 8:00am and 8:00pm.");
    const waiting = await saveReminder(user.id, id.parse(eventId), reminderId ? id.parse(reminderId) : null, v);
    refresh(eventId);
    return waiting;
  });
}
export async function removeEventReminder(eventId: string, reminderId: string) {
  return guarded("manageEvents", async (user) => { await deleteReminder(user.id, id.parse(eventId), id.parse(reminderId)); refresh(eventId); });
}

export async function previewEventReminder(eventId: string, body: string, attendeeId: string | null) {
  return guarded("manageEvents", async () => previewReminder(id.parse(eventId), z.string().max(1000).parse(body), attendeeId ? id.parse(attendeeId) : null));
}

export async function saveEventSignup(eventId: string, input: unknown) {
  return guarded("manageEvents", async (user) => {
    const v = z.object({ on: z.boolean(), opens: isoDate.or(z.literal("")), closes: isoDate.or(z.literal("")), newLink: z.boolean().optional() }).parse(input);
    // Opens at the start of its day and closes at the end of its day, Central time.
    const key = await setSignup(user.id, id.parse(eventId), { on: v.on, opensAt: v.opens ? centralToUtc(v.opens, "00:00") : null, closesAt: v.closes ? centralToUtc(v.closes, "23:59") : null, newLink: v.newLink });
    refresh(eventId);
    return key;
  });
}

// ---------- Waitlist ("Wants Wolves Tickets") ----------

export async function addToWaitlist(eventId: string, input: unknown) {
  return guarded("manageEvents", async (user) => {
    const v = z.object({ personIds: z.array(id).min(1, "Pick at least one contact.").max(50), slotIds: z.array(id).max(200).optional(), note: z.string().max(500).optional() }).parse(input);
    await addInterest(user.id, id.parse(eventId), v.personIds, { slotIds: v.slotIds, note: v.note });
    refresh(eventId);
  });
}

export async function removeFromWaitlist(eventId: string, interestId: string) {
  return guarded("manageEvents", async (user) => { await removeInterest(user.id, id.parse(interestId)); refresh(eventId); });
}

export async function previewGameOffer(eventId: string, slotIds: string[], personId: string | null, body: string, fromId?: string | null) {
  return guarded("manageEvents", async (user) => previewOffer(user, id.parse(eventId), z.array(id).min(1).max(100).parse(slotIds), personId ? id.parse(personId) : null, z.string().max(1500).parse(body), fromId ? id.parse(fromId) : null));
}

/** Texts one or more games to people on the waitlist (needs Send texts too). */
export async function sendGameOffer(eventId: string, slotIds: string[], input: unknown) {
  return guarded("manageEvents", async (user) => {
    if (!user.permissions.includes("sendTexts")) throw new UserError("You don't have permission to send texts.");
    const v = z.object({ personIds: z.array(id).min(1, "Pick who to text.").max(100), body: z.string().trim().min(1, "Write the text.").max(1500), markInvited: z.boolean(), fromId: id.nullable().optional(), addOwner: z.boolean().optional() }).parse(input);
    const r = await offerGame(user.id, id.parse(eventId), z.array(id).min(1, "Pick at least one game.").max(100).parse(slotIds), v.personIds, v.body, v.markInvited, v.fromId, v.addOwner ?? false);
    refresh(eventId);
    return r;
  });
}

export async function readAssignments(eventId: string, csv: string) {
  return guarded("manageEvents", async () => previewAssignments(id.parse(eventId), z.string().max(1_000_000).parse(csv)));
}

export async function saveAssignments(eventId: string, input: unknown) {
  return guarded("manageEvents", async (user) => {
    const v = z.object({ status, items: z.array(z.object({ slotId: id.nullable(), wait: z.string().max(200), personId: id.nullable(), name: z.string().max(120), phone: z.string().max(40), email: z.string().max(200), seats: z.string().max(500) })).min(1, "Nothing to save.").max(2000) }).parse(input);
    const r = await applyAssignments(user.id, id.parse(eventId), v.items, v.status);
    refresh(eventId);
    return r;
  });
}

/** The signup page's wording and questions. */
export async function saveEventSignupPage(eventId: string, input: unknown) {
  return guarded("manageEvents", async (user) => {
    const v = z.object({ title: z.string().max(120), intro: z.string().max(2000), gamesOn: z.boolean(), gamesLabel: z.string().max(200), thanks: z.string().max(500), email: z.enum(["required", "optional", "off"]), fields }).parse(input);
    await saveSignupPage(user.id, id.parse(eventId), v);
    refresh(eventId);
  });
}

/** A/B/C tier on the waitlist. */
export async function setWaitlistTier(eventId: string, interestId: string, tier: string) {
  return guarded("manageEvents", async (user) => {
    await setInterestTier(user.id, id.parse(interestId), z.enum(["", "A", "B", "C"]).parse(tier));
    refresh(eventId);
  });
}

// Open-game emails (owner request 2026-11-23): email chosen teammates when a game coming up has nobody going.
const openAlert = z.object({ on: z.boolean(), days: z.number().int().min(1).max(60), freq: z.enum(["daily", "weekly"]), day: z.number().int().min(0).max(6),
  time: z.string().regex(/^([01]\d|2[0-3]):(00|15|30|45)$/, "Pick a time"), to: z.array(id).max(10) });
export async function saveOpenAlertAction(eventId: string, input: unknown) {
  return guarded("manageEvents", async (user) => {
    const v = openAlert.parse(input);
    if (v.on && !v.to.length) throw new UserError("Pick who gets the email.");
    await saveOpenAlert(user.id, id.parse(eventId), v);
    refresh(eventId);
  });
}
export async function testOpenAlertAction(eventId: string, input: unknown) {
  return guarded("manageEvents", async () => {
    const v = openAlert.parse(input);
    if (!v.to.length) throw new UserError("Pick who gets the email.");
    const r = await sendOpenAlert(id.parse(eventId), { ...v, on: true }, true);
    if (!r.ok) throw new UserError(r.error);
    return { games: r.games };
  });
}
export async function setEventSenderAction(eventId: string, senderId: string) {
  return guarded("manageEvents", async (user) => { await setEventSender(user.id, id.parse(eventId), id.parse(senderId)); refresh(eventId); });
}
