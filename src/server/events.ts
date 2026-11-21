import "server-only";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { logActivity } from "@/server/activity";
import { UserError } from "@/server/safe";
import { hasTextStop } from "@/server/texting";
import { fill, mergeValues } from "@/lib/merge";
import { canText } from "@/lib/texting";
import { formatPhone, isoFromDate, dateFromIso, normalizePhone } from "@/lib/normalize";
import { centralToUtc, quietNow, scheduleLabel } from "@/lib/scheduledText";
import {
  answerSummary, ASSIGNED, cleanAnswers, cleanFields, gameFor, matchName, readAssignmentCsv, stillWaiting, cleanTemplateReminders, eventMergeValues, NBA_HEADERS, nbaScheduleUrl, parseNbaSchedule, reminderSendAt, slotLine, statusLabel,
  type Answers, type EventField, type ImportedSlot, type TemplateReminder,
} from "@/lib/events";

// Events (owner request 2026-11-21; SPEC.md §6.7). Reminders are ordinary scheduled texts (ScheduledText with an
// eventKey "evt:<eventId>:<reminderId>:<attendeeId>"), so they show in each contact's Scheduled box and Tasks →
// Scheduled, can be turned off there, and go out through the usual sender (STOP, daily cap, Messages history).

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
export const fieldsOf = (v: unknown): EventField[] => cleanFields(v);
const answersOf = (v: unknown): Answers => Object.fromEntries(Object.entries(obj(v)).map(([k, x]) => [k, String(x ?? "")]));

async function owner() {
  return db.user.findFirst({ where: { isOwner: true, status: { not: "DISABLED" } }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
}
export const newSignupKey = () => randomBytes(24).toString("base64url");

// ---------- Templates ----------

export async function loadTemplates() {
  const rows = await db.eventTemplate.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, include: { _count: { select: { events: { where: { deletedAt: null } } } } } });
  return rows.map((t) => ({ id: t.id, name: t.name, type: t.type, multiSlot: t.multiSlot, doneLabel: t.doneLabel, location: t.location, intro: t.intro, waitlistLabel: t.waitlistLabel, offerText: t.offerText,
    fields: fieldsOf(t.fields), reminders: cleanTemplateReminders(t.reminders), events: t._count.events }));
}
export type TemplateView = Awaited<ReturnType<typeof loadTemplates>>[number];

export type TemplateInput = { id?: string | null; name: string; type: string; multiSlot: boolean; doneLabel: string; location: string; intro: string; waitlistLabel: string; offerText: string; fields: unknown; reminders: unknown };
export async function saveTemplate(userId: string, t: TemplateInput) {
  const data = { name: t.name.trim().slice(0, 120), type: t.type.trim().slice(0, 60), multiSlot: t.multiSlot, doneLabel: t.doneLabel.trim().slice(0, 40) || "Tickets sent",
    location: t.location.trim().slice(0, 200), intro: t.intro.trim().slice(0, 2000), waitlistLabel: t.waitlistLabel.trim().slice(0, 60), offerText: t.offerText.trim().slice(0, 1000),
    fields: cleanFields(t.fields), reminders: cleanTemplateReminders(t.reminders) };
  if (!data.name) throw new UserError("Give the template a name.");
  const saved = t.id
    ? await db.eventTemplate.update({ where: { id: t.id, deletedAt: null }, data })
    : await db.eventTemplate.create({ data });
  await logActivity(userId, t.id ? "update" : "create", "eventTemplate", saved.id, `${t.id ? "Edited" : "Added"} event template "${saved.name}"`);
  return saved.id;
}
export async function deleteTemplate(userId: string, id: string) {
  const t = await db.eventTemplate.update({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } });
  await logActivity(userId, "delete", "eventTemplate", id, `Removed event template "${t.name}" (its events stay)`);
}

// ---------- Events ----------

/** A new event: from a template (questions, reminders, settings copied) or blank. A single event gets its one date. */
export async function createEvent(userId: string, o: { templateId: string | null; name: string; date: string | null; time: string | null }) {
  const t = o.templateId ? await db.eventTemplate.findFirst({ where: { id: o.templateId, deletedAt: null } }) : null;
  if (o.templateId && !t) throw new UserError("That template was removed.");
  const name = o.name.trim().slice(0, 120);
  if (!name) throw new UserError("Give the event a name.");
  const multi = t?.multiSlot ?? false;
  if (!multi && !o.date) throw new UserError("Pick the event's date.");
  const sender = await owner();
  const e = await db.$transaction(async (tx) => {
    const e = await tx.event.create({ data: {
      templateId: t?.id ?? null, name, type: t?.type ?? "", multiSlot: multi, doneLabel: t?.doneLabel ?? "Confirmed", fields: t ? cleanFields(t.fields) : [],
      location: t?.location ?? "", intro: t?.intro ?? "", waitlistLabel: t?.waitlistLabel ?? "", offerText: t?.offerText ?? "", senderId: sender?.id ?? userId, createdById: userId,
    } });
    if (!multi && o.date) await tx.eventSlot.create({ data: { eventId: e.id, date: dateFromIso(o.date), time: o.time, location: t?.location ?? "" } });
    for (const r of t ? cleanTemplateReminders(t.reminders) : []) await tx.eventReminder.create({ data: { eventId: e.id, name: r.name, body: r.body, daysBefore: r.daysBefore, time: r.time } });
    return e;
  });
  await logActivity(userId, "create", "event", e.id, `Added event "${name}"${t ? ` from the "${t.name}" template` : ""}`);
  return e.id;
}

export async function loadEvents() {
  const today = dateFromIso(isoFromDate(new Date()));
  const rows = await db.event.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, include: {
    slots: { orderBy: [{ date: "asc" }, { time: "asc" }], select: { id: true, date: true, time: true, title: true } },
    attendees: { select: { slotId: true, personId: true, status: true } },
    interests: { where: { person: { deletedAt: null } }, select: { personId: true } },
  } });
  return rows.map((e) => {
    const next = e.slots.find((s) => s.date >= today) ?? null;
    const last = e.slots[e.slots.length - 1] ?? null;
    const going = (id: string) => e.attendees.filter((a) => a.slotId === id && ASSIGNED.includes(a.status)).length;
    const upcoming = e.slots.filter((s) => s.date >= today);
    return { id: e.id, name: e.name, type: e.type, multiSlot: e.multiSlot, slots: e.slots.length, attendees: new Set(e.attendees.map((a) => a.personId)).size, signupOn: e.signupOn,
      first: e.slots[0] ? isoFromDate(e.slots[0].date) : null, next: next ? isoFromDate(next.date) : null, last: last ? isoFromDate(last.date) : null,
      nextTitle: next?.title ?? "", nextTime: next?.time ?? null, nextGoing: next ? going(next.id) : 0,
      upcoming: upcoming.length, needPeople: upcoming.filter((s) => !going(s.id)).length, waiting: stillWaiting(e.interests, e.attendees).length };
  }).sort((a, b) => (a.next ? 0 : 1) - (b.next ? 0 : 1) || (a.next ?? b.last ?? "").localeCompare(b.next ?? a.last ?? ""));
}

export async function loadEvent(id: string) {
  const e = await db.event.findFirst({ where: { id, deletedAt: null }, include: {
    slots: { orderBy: [{ date: "asc" }, { time: "asc" }] },
    attendees: { orderBy: { createdAt: "asc" }, include: { person: { select: { id: true, name: true, deletedAt: true, phones: { orderBy: { position: "asc" }, select: { number: true, label: true } } } } } },
    reminders: { orderBy: [{ daysBefore: "desc" }, { time: "asc" }] },
    interests: { orderBy: { createdAt: "asc" }, include: { person: { select: { id: true, name: true, deletedAt: true, phones: { orderBy: { position: "asc" }, select: { number: true, label: true } } } } } },
  } });
  if (!e) return null;
  const live = e.interests.filter((i) => !i.person.deletedAt);
  const waiting = new Set(stillWaiting(live, e.attendees).map((i) => i.id));
  const texts = await db.scheduledText.findMany({ where: { eventKey: { startsWith: `evt:${e.id}:` } }, select: { eventKey: true, status: true, sendAt: true } });
  const counts = (rid: string) => {
    const mine = texts.filter((t) => t.eventKey!.split(":")[2] === rid);
    const next = mine.filter((t) => t.status === "pending").sort((a, b) => a.sendAt.getTime() - b.sendAt.getTime())[0];
    return { pending: mine.filter((t) => t.status === "pending" || t.status === "sending").length, sent: mine.filter((t) => t.status === "sent").length,
      failed: mine.filter((t) => t.status === "failed").length, off: mine.filter((t) => t.status === "canceled").length, next: next ? scheduleLabel(next.sendAt) : null };
  };
  const team = await db.user.findMany({ where: { status: { not: "DISABLED" }, textNumber: { not: null } }, orderBy: [{ isOwner: "desc" }, { name: "asc" }], select: { id: true, name: true, textNumber: true } });
  return {
    id: e.id, name: e.name, type: e.type, multiSlot: e.multiSlot, doneLabel: e.doneLabel, fields: fieldsOf(e.fields), location: e.location, notes: e.notes, intro: e.intro,
    waitlistLabel: e.waitlistLabel, offerText: e.offerText,
    waitlist: live.map((i) => ({ id: i.id, personId: i.person.id, name: i.person.name, phone: i.person.phones.find((p) => canText(p.label))?.number ?? null, slotIds: i.slotIds, note: i.note,
      source: i.source, since: isoFromDate(i.createdAt), waiting: waiting.has(i.id),
      offered: e.attendees.filter((a) => a.personId === i.personId && a.status === "invited").map((a) => a.slotId),
      games: e.attendees.filter((a) => a.personId === i.personId && ASSIGNED.includes(a.status)).map((a) => a.slotId) })),
    senderId: e.senderId, signupKey: e.signupKey, signupOn: e.signupOn, signupOpensAt: e.signupOpensAt?.toISOString() ?? null, signupClosesAt: e.signupClosesAt?.toISOString() ?? null,
    slots: e.slots.map((s) => ({ id: s.id, date: isoFromDate(s.date), time: s.time, title: s.title, opponent: s.opponent, location: s.location, details: s.details, imported: !!s.externalId })),
    attendees: e.attendees.filter((a) => !a.person.deletedAt).map((a) => ({ id: a.id, slotId: a.slotId, personId: a.person.id, name: a.person.name, status: a.status, source: a.source,
      answers: answersOf(a.answers), phone: a.person.phones.find((p) => canText(p.label))?.number ?? null })),
    reminders: e.reminders.map((r) => ({ id: r.id, name: r.name, body: r.body, daysBefore: r.daysBefore, time: r.time, statuses: r.statuses, active: r.active, ...counts(r.id) })),
    senders: team.map((u) => ({ id: u.id, name: u.name, number: formatPhone(u.textNumber!) })),
  };
}
export type EventView = NonNullable<Awaited<ReturnType<typeof loadEvent>>>;

export type EventInput = { name: string; type: string; location: string; notes: string; intro: string; doneLabel: string; fields: unknown; senderId: string | null; waitlistLabel: string; offerText: string };
export async function updateEvent(userId: string, id: string, v: EventInput) {
  const name = v.name.trim().slice(0, 120);
  if (!name) throw new UserError("Give the event a name.");
  if (v.senderId && !(await db.user.findFirst({ where: { id: v.senderId, textNumber: { not: null }, status: { not: "DISABLED" } } }))) throw new UserError("Pick someone with an HQ number to send the reminders.");
  const before = await db.event.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw new UserError("That event was removed.");
  await db.event.update({ where: { id }, data: { name, type: v.type.trim().slice(0, 60), location: v.location.trim().slice(0, 200), notes: v.notes.trim().slice(0, 4000), intro: v.intro.trim().slice(0, 2000),
    doneLabel: v.doneLabel.trim().slice(0, 40) || "Confirmed", fields: cleanFields(v.fields), senderId: v.senderId,
    waitlistLabel: v.waitlistLabel.trim().slice(0, 60), offerText: v.offerText.trim().slice(0, 1000) } });
  if (before.waitlistLabel !== v.waitlistLabel.trim().slice(0, 60)) await syncWaitlistTag(id, before.waitlistLabel);
  await logActivity(userId, "update", "event", id, `Edited event "${name}"${before.name !== name ? ` (was "${before.name}")` : ""}`);
  await syncEventReminders(id);
  await syncWaitlistTag(id);
}

export async function deleteEvent(userId: string, id: string) {
  const e = await db.event.update({ where: { id, deletedAt: null }, data: { deletedAt: new Date(), signupOn: false } });
  const off = await cancelEventTexts(id);
  await logActivity(userId, "delete", "event", id, `Removed event "${e.name}"${off ? ` and turned off ${off} scheduled reminder texts` : ""}`);
}

async function cancelEventTexts(eventId: string, extra: { reminderId?: string; attendeeIds?: string[] } = {}) {
  const prefix = `evt:${eventId}:${extra.reminderId ? `${extra.reminderId}:` : ""}`;
  const rows = await db.scheduledText.findMany({ where: { status: "pending", eventKey: { startsWith: prefix } }, select: { id: true, eventKey: true } });
  const ids = rows.filter((r) => !extra.attendeeIds || extra.attendeeIds.includes(r.eventKey!.split(":")[3])).map((r) => r.id);
  if (!ids.length) return 0;
  return (await db.scheduledText.updateMany({ where: { id: { in: ids }, status: "pending" }, data: { status: "canceled", error: "No longer needed (event changed)." } })).count;
}

// ---------- Slots ----------

export type SlotInput = { date: string; time: string | null; title: string; opponent: string; location: string; details: string };
const slotData = (s: SlotInput) => ({ date: dateFromIso(s.date), time: s.time || null, title: s.title.trim().slice(0, 120), opponent: s.opponent.trim().slice(0, 120), location: s.location.trim().slice(0, 200), details: s.details.trim().slice(0, 500) });

export async function saveSlot(userId: string, eventId: string, id: string | null, s: SlotInput) {
  const e = await db.event.findFirst({ where: { id: eventId, deletedAt: null } });
  if (!e) throw new UserError("That event was removed.");
  if (!id && !e.multiSlot && (await db.eventSlot.count({ where: { eventId } }))) throw new UserError("This event has one date; change it instead.");
  const saved = id ? await db.eventSlot.update({ where: { id, eventId }, data: slotData(s) }) : await db.eventSlot.create({ data: { eventId, ...slotData(s) } });
  await logActivity(userId, id ? "update" : "create", "event", eventId, `${id ? "Changed" : "Added"} ${slotLine({ title: saved.title, date: s.date }, e.name)} on "${e.name}"`);
  await syncEventReminders(eventId);
}

export async function deleteSlot(userId: string, eventId: string, id: string) {
  const e = await db.event.findFirst({ where: { id: eventId, deletedAt: null }, include: { slots: { select: { id: true } } } });
  if (!e) throw new UserError("That event was removed.");
  if (!e.multiSlot && e.slots.length <= 1) throw new UserError("A single event keeps its one date; remove the event instead.");
  const s = await db.eventSlot.findFirst({ where: { id, eventId }, include: { attendees: { select: { id: true } } } });
  if (!s) return;
  await cancelEventTexts(eventId, { attendeeIds: s.attendees.map((a) => a.id) });
  await db.eventSlot.delete({ where: { id } });
  await logActivity(userId, "delete", "event", eventId, `Removed ${slotLine({ title: s.title, date: isoFromDate(s.date) }, e.name)} from "${e.name}" (${s.attendees.length} attendees)`);
  await syncWaitlistTag(eventId);
}

/** Dates from the NBA schedule or a spreadsheet: a game already there (same NBA id, or same date and title) is updated, not doubled. */
export async function importSlots(userId: string, eventId: string, slots: ImportedSlot[], how: string) {
  const e = await db.event.findFirst({ where: { id: eventId, deletedAt: null }, include: { slots: true } });
  if (!e) throw new UserError("That event was removed.");
  if (!e.multiSlot) throw new UserError("This event has a single date. Importing is for events with many dates.");
  let added = 0, updated = 0;
  for (const s of slots.slice(0, 200)) {
    const onDay = e.slots.filter((x) => isoFromDate(x.date) === s.date);
    const same = e.slots.find((x) => s.externalId && x.externalId === s.externalId)
      ?? (s.externalId ? undefined : onDay.find((x) => x.title.toLowerCase() === s.title.toLowerCase()) ?? (onDay.length === 1 ? onDay[0] : undefined));
    // Seats typed in HQ stay when the schedule is imported again.
    // A spreadsheet doesn't rename a game the NBA import already named.
    const data = { ...slotData({ ...s, title: same?.externalId && !s.externalId ? same.title : s.title, opponent: same?.externalId && !s.externalId ? same.opponent : s.opponent,
      details: s.details || same?.details || "", location: s.location || same?.location || "" }), externalId: s.externalId ?? same?.externalId ?? null };
    if (same) { await db.eventSlot.update({ where: { id: same.id }, data }); updated++; }
    else { await db.eventSlot.create({ data: { eventId, ...data } }); added++; }
  }
  await logActivity(userId, "create", "event", eventId, `Imported dates into "${e.name}" (${how}): ${added} added, ${updated} updated`);
  await syncEventReminders(eventId);
  return { added, updated };
}

/** The Timberwolves' home games for a season, from the NBA's public schedule. */
export async function fetchWolvesSchedule(season: string): Promise<ImportedSlot[]> {
  const r = await fetch(nbaScheduleUrl(), { cache: "no-store", headers: NBA_HEADERS, signal: AbortSignal.timeout(20000) }).catch(() => null);
  if (!r?.ok) throw new UserError("Couldn't reach the NBA's schedule right now. Try again later, or upload a spreadsheet of the games.");
  let json: unknown;
  try { json = await r.json(); } catch { throw new UserError("The NBA's schedule couldn't be read. Upload a spreadsheet of the games instead."); }
  try {
    const out = parseNbaSchedule(json, "MIN", season).slots;
    if (!out.length) throw new UserError(`No Timberwolves home games were found for ${season}.`);
    return out;
  } catch (e) { throw e instanceof UserError ? e : new UserError(e instanceof Error ? e.message : "The NBA's schedule couldn't be read."); }
}

// ---------- Attendees ----------

export async function addAttendees(userId: string, eventId: string, slotIds: string[], personIds: string[], status: string, answers: Answers = {}, source = "manual") {
  const e = await db.event.findFirst({ where: { id: eventId, deletedAt: null }, include: { slots: { where: { id: { in: slotIds } }, select: { id: true, title: true, date: true } } } });
  if (!e) throw new UserError("That event was removed.");
  if (!e.slots.length) throw new UserError(e.multiSlot ? "Pick at least one game or date." : "This event needs its date first.");
  const people = await db.person.findMany({ where: { id: { in: personIds }, deletedAt: null }, select: { id: true, name: true } });
  if (!people.length) throw new UserError("Pick at least one contact.");
  const clean = cleanAnswers(fieldsOf(e.fields), answers);
  let added = 0;
  for (const s of e.slots) for (const p of people) {
    const had = await db.eventAttendee.findUnique({ where: { slotId_personId: { slotId: s.id, personId: p.id } } });
    if (had) {
      if (source === "signup") await db.eventAttendee.update({ where: { id: had.id }, data: { answers: { ...answersOf(had.answers), ...clean }, ...(had.status === "declined" ? { status } : {}) } });
      continue;
    }
    await db.eventAttendee.create({ data: { eventId, slotId: s.id, personId: p.id, status, answers: clean, source } });
    added++;
  }
  await logActivity(userId, "create", "event", eventId, `Added ${people.map((p) => p.name).join(", ")} to "${e.name}" (${e.slots.length} ${e.slots.length === 1 ? "date" : "dates"}, ${statusLabel(status, e.doneLabel)})`);
  await syncEventReminders(eventId);
  await syncWaitlistTag(eventId);
  for (const p of people) revalidatePath(`/people/${p.id}`);
  return added;
}

export async function updateAttendee(userId: string, id: string, v: { status: string; answers: Answers }) {
  const a = await db.eventAttendee.findUnique({ where: { id }, include: { event: true, person: { select: { name: true } } } });
  if (!a || a.event.deletedAt) throw new UserError("That attendee was removed.");
  const answers = cleanAnswers(fieldsOf(a.event.fields), v.answers);
  await db.eventAttendee.update({ where: { id }, data: { status: v.status, answers } });
  await logActivity(userId, "update", "event", a.eventId, `${a.person.name} on "${a.event.name}": ${statusLabel(a.status, a.event.doneLabel)} → ${statusLabel(v.status, a.event.doneLabel)}`);
  await syncEventReminders(a.eventId);
  await syncWaitlistTag(a.eventId);
  revalidatePath(`/people/${a.personId}`);
}

export async function removeAttendee(userId: string, id: string) {
  const a = await db.eventAttendee.findUnique({ where: { id }, include: { event: true, person: { select: { name: true } }, slot: true } });
  if (!a) return;
  await cancelEventTexts(a.eventId, { attendeeIds: [id] });
  await db.eventAttendee.delete({ where: { id } });
  await logActivity(userId, "delete", "event", a.eventId, `Took ${a.person.name} off ${slotLine({ title: a.slot.title, date: isoFromDate(a.slot.date) }, a.event.name)}`);
  await syncWaitlistTag(a.eventId);
  revalidatePath(`/people/${a.personId}`);
}

/** A contact's waitlists ("Wants Wolves Tickets"): waiting, or has a game. */
export async function loadPersonWaitlists(personId: string) {
  const rows = await db.eventInterest.findMany({ where: { personId, event: { deletedAt: null } }, include: { event: { include: { attendees: { where: { personId }, select: { personId: true, status: true } } } } } });
  return rows.map((i) => ({ id: i.id, eventId: i.eventId, label: i.event.waitlistLabel || `Waitlist: ${i.event.name}`, since: isoFromDate(i.createdAt), waiting: stillWaiting([i], i.event.attendees).length > 0 }));
}

/** A contact's events, newest first, for the Events card on their page. */
export async function loadPersonEvents(personId: string) {
  const rows = await db.eventAttendee.findMany({ where: { personId, event: { deletedAt: null } }, include: { event: true, slot: true }, orderBy: { slot: { date: "desc" } }, take: 50 });
  return rows.map((a) => {
    const summary = answerSummary(fieldsOf(a.event.fields), answersOf(a.answers));
    return { id: a.id, eventId: a.eventId, line: slotLine({ title: a.slot.title, date: isoFromDate(a.slot.date) }, a.event.name), summary,
      date: isoFromDate(a.slot.date), status: a.status, statusLabel: statusLabel(a.status, a.event.doneLabel) };
  });
}

// ---------- Reminders ----------

export type ReminderInput = { name: string; body: string; daysBefore: number; time: string; statuses: string[]; active: boolean };
export async function saveReminder(userId: string, eventId: string, id: string | null, r: ReminderInput) {
  const e = await db.event.findFirst({ where: { id: eventId, deletedAt: null } });
  if (!e) throw new UserError("That event was removed.");
  const data = { name: r.name.trim().slice(0, 80) || "Reminder", body: r.body.trim().slice(0, 1000), daysBefore: r.daysBefore, time: r.time, statuses: r.statuses, active: r.active };
  if (!data.body) throw new UserError("Write the reminder text.");
  const saved = id ? await db.eventReminder.update({ where: { id, eventId }, data }) : await db.eventReminder.create({ data: { eventId, ...data } });
  await logActivity(userId, id ? "update" : "create", "event", eventId, `${id ? "Changed" : "Added"} reminder "${saved.name}" on "${e.name}"${saved.active ? "" : " (off)"}`);
  return syncEventReminders(eventId);
}
export async function deleteReminder(userId: string, eventId: string, id: string) {
  const r = await db.eventReminder.findFirst({ where: { id, eventId } });
  if (!r) return;
  const off = await cancelEventTexts(eventId, { reminderId: id });
  await db.eventReminder.delete({ where: { id } });
  await logActivity(userId, "delete", "event", eventId, `Removed reminder "${r.name}"${off ? ` (${off} scheduled texts turned off)` : ""}`);
}

type PersonForText = { id: string; name: string; mailingName: string | null; legalNames: string | null; address: string | null; phones: { number: string; normalized: string; label: string }[]; emails: { address: string }[] };
const personSelect = { id: true, name: true, mailingName: true, legalNames: true, address: true, phones: { orderBy: { position: "asc" as const }, select: { number: true, normalized: true, label: true } }, emails: { orderBy: { position: "asc" as const }, select: { address: true }, take: 1 } };

function reminderText(body: string, p: PersonForText, e: { name: string; location: string }, s: { date: Date; time: string | null; title: string; opponent: string; location: string; details: string }, answers: Answers, sender: string) {
  const contact = mergeValues({ personName: p.name, mailingName: p.mailingName, legalNames: p.legalNames, email: p.emails[0]?.address, phone: p.phones[0]?.number, homeAddress: p.address, myName: sender } as Parameters<typeof mergeValues>[0]);
  return fill(body, { ...contact, ...eventMergeValues(e, { ...s, date: isoFromDate(s.date) }, answers) });
}

/** The reminder filled in for one attendee (the first one it would go to, else a pretend one), for the preview. */
export async function previewReminder(eventId: string, body: string, attendeeId: string | null) {
  const e = await db.event.findFirst({ where: { id: eventId, deletedAt: null }, include: { slots: { orderBy: { date: "asc" }, take: 1 } } });
  if (!e) throw new UserError("That event was removed.");
  const a = attendeeId ? await db.eventAttendee.findFirst({ where: { id: attendeeId, eventId }, include: { slot: true, person: { select: personSelect } } })
    : await db.eventAttendee.findFirst({ where: { eventId, person: { deletedAt: null } }, orderBy: [{ slot: { date: "asc" } }], include: { slot: true, person: { select: personSelect } } });
  const sender = e.senderId ? (await db.user.findUnique({ where: { id: e.senderId }, select: { name: true } }))?.name ?? "" : "";
  if (a) { const r = reminderText(body, a.person, e, a.slot, answersOf(a.answers), sender); return { text: r.text, missing: r.missing, who: `${a.person.name} · ${slotLine({ title: a.slot.title, date: isoFromDate(a.slot.date) }, e.name)}` }; }
  const slot = e.slots[0] ?? { date: new Date(), time: "19:00", title: "", opponent: "", location: "", details: "" };
  const sample: PersonForText = { id: "", name: "Sam & Lena Ortiz", mailingName: null, legalNames: null, address: null, phones: [], emails: [] };
  const r = reminderText(body, sample, e, slot, {}, sender);
  return { text: r.text, missing: r.missing, who: "a sample contact (Sam & Lena Ortiz); no attendees yet" };
}

/**
 * Keeps an event's reminder texts in step: one scheduled text per active reminder × attendee (with a status the
 * reminder is for) whose time is still ahead. New attendees get theirs; changed wording, dates or answers update the
 * pending ones; ones no longer wanted are turned off. Texts already sent, failed or turned off by hand are left alone
 * (a reminder turned off on a contact page isn't brought back). Returns how many are waiting to go out.
 */
export async function syncEventReminders(eventId: string, now = new Date()): Promise<number> {
  const e = await db.event.findFirst({ where: { id: eventId }, include: { reminders: true, slots: true,
    attendees: { include: { person: { select: { ...personSelect, deletedAt: true } } } } } });
  if (!e) return 0;
  const existing = await db.scheduledText.findMany({ where: { eventKey: { startsWith: `evt:${eventId}:` } } });
  const byKey = new Map(existing.map((x) => [x.eventKey!, x]));
  const senderId = e.senderId ?? (await owner())?.id ?? e.createdById;
  if (!senderId) return 0;
  const sender = (await db.user.findUnique({ where: { id: senderId }, select: { name: true } }))?.name ?? "";
  const slots = new Map(e.slots.map((s) => [s.id, s]));
  const wanted = new Map<string, { personId: string; numbers: string[]; body: string; sendAt: Date }>();
  if (!e.deletedAt) for (const r of e.reminders.filter((x) => x.active)) for (const a of e.attendees) {
    const s = slots.get(a.slotId);
    if (!s || a.person.deletedAt || !r.statuses.includes(a.status)) continue;
    const sendAt = reminderSendAt(isoFromDate(s.date), r.daysBefore, r.time);
    if (sendAt <= now) continue;
    const numbers = [...new Set(a.person.phones.filter((p) => canText(p.label) && p.normalized.length === 10).map((p) => p.normalized))];
    if (!numbers.length || (await hasTextStop(a.person.id))) continue;
    wanted.set(`evt:${e.id}:${r.id}:${a.id}`, { personId: a.person.id, numbers, body: reminderText(r.body, a.person, e, s, answersOf(a.answers), sender).text, sendAt });
  }
  for (const x of existing) {
    if (x.status !== "pending") continue;
    const w = wanted.get(x.eventKey!);
    if (!w) await db.scheduledText.update({ where: { id: x.id }, data: { status: "canceled", error: "No longer needed (event changed)." } });
    else if (w.body !== x.body || w.sendAt.getTime() !== x.sendAt.getTime() || w.numbers.join() !== x.numbers.join() || x.createdById !== senderId)
      await db.scheduledText.update({ where: { id: x.id }, data: { body: w.body, sendAt: w.sendAt, numbers: w.numbers, createdById: senderId } });
  }
  for (const [key, w] of wanted) if (!byKey.has(key)) await db.scheduledText.create({ data: { personId: w.personId, numbers: w.numbers, body: w.body, sendAt: w.sendAt, createdById: senderId, eventKey: key } });
  return [...wanted.keys()].filter((k) => { const x = byKey.get(k); return !x || x.status === "pending"; }).length;
}

// ---------- Signup page ----------

export async function setSignup(userId: string, eventId: string, v: { on: boolean; opensAt: Date | null; closesAt: Date | null; newLink?: boolean }) {
  const e = await db.event.findFirst({ where: { id: eventId, deletedAt: null } });
  if (!e) throw new UserError("That event was removed.");
  if (v.opensAt && v.closesAt && v.closesAt <= v.opensAt) throw new UserError("The close date has to be after the open date.");
  const key = !e.signupKey || v.newLink ? newSignupKey() : e.signupKey;
  await db.event.update({ where: { id: eventId }, data: { signupOn: v.on, signupOpensAt: v.opensAt, signupClosesAt: v.closesAt, signupKey: key } });
  await logActivity(userId, "update", "event", eventId, `Signup page for "${e.name}" ${v.on ? "on" : "off"}${v.newLink ? " (new link; the old one stopped working)" : ""}`);
  return key;
}

export async function loadSignup(key: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(key)) return null;
  const e = await db.event.findFirst({ where: { signupKey: key, deletedAt: null }, include: { slots: { orderBy: [{ date: "asc" }, { time: "asc" }] } } });
  if (!e) return null;
  const today = isoFromDate(new Date());
  return { id: e.id, name: e.name, intro: e.intro, location: e.location, multiSlot: e.multiSlot, fields: fieldsOf(e.fields), signupOn: e.signupOn, signupOpensAt: e.signupOpensAt, signupClosesAt: e.signupClosesAt,
    slots: e.slots.map((s) => ({ id: s.id, date: isoFromDate(s.date), time: s.time, title: s.title, opponent: s.opponent, location: s.location })).filter((s) => s.date >= today) };
}

/**
 * A signup: matched to a contact by phone or email (else a new contact), added to the event (a single event as
 * Confirmed; for games, each one they picked as Invited, a request for Luke to confirm), with a note on their
 * timeline and an alert. Reminders follow automatically.
 */
export async function receiveSignup(eventId: string, v: { first: string; last: string; phone: string; email: string; slotIds: string[]; answers: Answers }) {
  const e = await db.event.findFirst({ where: { id: eventId, deletedAt: null }, include: { slots: { select: { id: true, title: true, date: true } } } });
  if (!e) throw new UserError("This signup page isn't available.");
  const own = await owner();
  const by = e.senderId ?? own?.id ?? e.createdById;
  if (!by) throw new UserError("This signup page isn't available.");
  const digits = normalizePhone(v.phone), email = v.email.trim().toLowerCase();
  const name = `${v.first.trim()} ${v.last.trim()}`.trim().slice(0, 120);
  const existing = await db.person.findFirst({ where: { deletedAt: null, OR: [...(digits.length === 10 ? [{ phones: { some: { normalized: digits } } }] : []), ...(email ? [{ emails: { some: { normalized: email } } }] : [])] }, select: { id: true, name: true } });
  const person = existing ?? await db.person.create({ data: {
    name, mailingName: name, createdById: by,
    phones: digits.length === 10 ? { create: [{ label: "Mobile", number: formatPhone(digits), normalized: digits, position: 0 }] } : undefined,
    emails: email ? { create: [{ label: "", address: email, normalized: email, position: 0 }] } : undefined,
  }, select: { id: true, name: true } });
  const slotIds = e.multiSlot ? v.slotIds.filter((id) => e.slots.some((s) => s.id === id)) : e.slots.map((s) => s.id).slice(0, 1);
  if (!e.multiSlot && !slotIds.length) throw new UserError("This event doesn't have a date yet.");
  const answers = cleanAnswers(fieldsOf(e.fields), v.answers);
  // Games (many dates): onto the waitlist, with the games they'd like; Luke assigns games from there (owner 2026-11-21).
  if (e.multiSlot) await addInterest(by, eventId, [person.id], { slotIds, note: fieldsOf(e.fields).filter((f) => answers[f.key]).map((f) => `${f.label} ${answers[f.key]}`).join(" · "), source: "signup" });
  else await addAttendees(by, eventId, slotIds, [person.id], "confirmed", answers, "signup");
  const picked = e.slots.filter((s) => slotIds.includes(s.id)).map((s) => slotLine({ title: s.title, date: isoFromDate(s.date) }, e.name));
  const summary = answerSummary(fieldsOf(e.fields), answers);
  const long = fieldsOf(e.fields).filter((f) => f.type === "long" && answers[f.key]).map((f) => `${f.label}: ${answers[f.key]}`);
  const list = e.waitlistLabel || `the ${e.name} waitlist`;
  await db.timelineEntry.create({ data: { personId: person.id, kind: "note", body: [`Signed up for ${e.name} (signup page)${e.multiSlot ? `: added to ${list}${picked.length ? `; would like ${picked.join(", ")}` : ""}` : ""}${summary ? ` · ${summary}` : ""}`, ...long].join("\n") } });
  const text = `Event signup: ${person.name}${existing ? "" : " (new contact)"} for ${e.name}${summary ? ` · ${summary}` : ""}${e.multiSlot ? ` · on ${list}${picked.length ? `, would like ${picked.length} ${picked.length === 1 ? "game" : "games"}` : ""}` : ""}`;
  // In everyone's bell; whether it pops up is each person's choice (My settings → Pop-up alerts → Event signups).
  const team = await db.user.findMany({ where: { status: { not: "DISABLED" } }, select: { id: true } });
  for (const u of team) await db.notification.create({ data: { toId: u.id, personId: person.id, alert: true, link: `/events/${e.id}`, text: text.slice(0, 300) } });
  return { personId: person.id, created: !existing };
}

export const remindersOf = (v: unknown): TemplateReminder[] => cleanTemplateReminders(v);

// ---------- Waitlist ("Wants Wolves Tickets", owner request 2026-11-21) ----------

export async function addInterest(userId: string, eventId: string, personIds: string[], o: { slotIds?: string[]; note?: string; source?: string } = {}) {
  const e = await db.event.findFirst({ where: { id: eventId, deletedAt: null }, include: { slots: { select: { id: true } } } });
  if (!e) throw new UserError("That event was removed.");
  const people = await db.person.findMany({ where: { id: { in: personIds }, deletedAt: null }, select: { id: true, name: true } });
  if (!people.length) throw new UserError("Pick at least one contact.");
  const slotIds = (o.slotIds ?? []).filter((id) => e.slots.some((s) => s.id === id));
  for (const p of people) {
    const had = await db.eventInterest.findUnique({ where: { eventId_personId: { eventId, personId: p.id } } });
    if (had) await db.eventInterest.update({ where: { id: had.id }, data: { slotIds: [...new Set([...had.slotIds, ...slotIds])], ...(o.note ? { note: [had.note, o.note].filter(Boolean).join(" · ").slice(0, 1000) } : {}) } });
    else await db.eventInterest.create({ data: { eventId, personId: p.id, slotIds, note: (o.note ?? "").slice(0, 1000), source: o.source ?? "manual" } });
    revalidatePath(`/people/${p.id}`);
  }
  await logActivity(userId, "create", "event", eventId, `Added ${people.map((p) => p.name).join(", ")} to ${e.waitlistLabel || `the "${e.name}" waitlist`}`);
  await syncWaitlistTag(eventId);
}

export async function removeInterest(userId: string, id: string) {
  const i = await db.eventInterest.findUnique({ where: { id }, include: { event: true, person: { select: { name: true } } } });
  if (!i) return;
  await db.eventInterest.delete({ where: { id } });
  await logActivity(userId, "delete", "event", i.eventId, `Took ${i.person.name} off ${i.event.waitlistLabel || `the "${i.event.name}" waitlist`}`);
  await syncWaitlistTag(i.eventId);
  revalidatePath(`/people/${i.personId}`);
}

/**
 * The waitlist's tag ("Wants Wolves Tickets") on exactly the people still waiting, so they can be picked in People lists,
 * mass texts and anywhere else tags are used. Someone waiting on another event with the same list name keeps it.
 * `oldLabel`: the list was renamed; its old tag comes off the people this event put it on.
 */
export async function syncWaitlistTag(eventId: string, oldLabel?: string) {
  const e = await db.event.findFirst({ where: { id: eventId }, select: { waitlistLabel: true } });
  const labels = [...new Set([e?.waitlistLabel ?? "", oldLabel ?? ""].map((l) => l.trim()).filter(Boolean))];
  for (const label of labels) {
    const events = await db.event.findMany({ where: { waitlistLabel: label, deletedAt: null }, include: { interests: { include: { person: { select: { deletedAt: true } } } }, attendees: { select: { personId: true, status: true } } } });
    const waiting = new Set(events.flatMap((ev) => stillWaiting(ev.interests.filter((i) => !i.person.deletedAt), ev.attendees).map((i) => i.personId)));
    const listed = new Set([...events.flatMap((ev) => ev.interests.map((i) => i.personId)), ...(await db.eventInterest.findMany({ where: { eventId }, select: { personId: true } })).map((i) => i.personId)]);
    const tag = await db.tag.upsert({ where: { name: label }, update: {}, create: { name: label } });
    const tagged = new Set((await db.personTag.findMany({ where: { tagId: tag.id }, select: { personId: true } })).map((t) => t.personId));
    for (const id of waiting) if (!tagged.has(id)) await db.personTag.create({ data: { personId: id, tagId: tag.id } }).catch(() => null);
    // Only people this list put the tag on lose it; a tag added by hand to someone not on the list stays.
    for (const id of tagged) if (listed.has(id) && !waiting.has(id)) await db.personTag.deleteMany({ where: { personId: id, tagId: tag.id } });
  }
}

/** The next time a text may go out: now during 8am–8pm Central, else 8am the next morning. */
function nextSendTime(now = new Date()): Date {
  if (!quietNow(now)) return now;
  const ct = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const g = (t: string) => ct.find((x) => x.type === t)?.value ?? "";
  const today = `${g("year")}-${g("month")}-${g("day")}`;
  const at = centralToUtc(today, "08:00");
  return Number(g("hour")) < 8 ? at : new Date(centralToUtc(new Date(Date.UTC(+g("year"), +g("month") - 1, +g("day") + 1)).toISOString().slice(0, 10), "08:00").getTime());
}

async function offerParts(eventId: string, slotId: string) {
  const e = await db.event.findFirst({ where: { id: eventId, deletedAt: null } });
  if (!e) throw new UserError("That event was removed.");
  const slot = await db.eventSlot.findFirst({ where: { id: slotId, eventId } });
  if (!slot) throw new UserError("That game was removed.");
  const senderId = e.senderId ?? (await owner())?.id;
  if (!senderId) throw new UserError("Pick who the texts go from (Edit details).");
  const sender = (await db.user.findUnique({ where: { id: senderId }, select: { name: true } }))?.name ?? "";
  return { e, slot, senderId, sender };
}

/** The offer text filled in for one person and game, for the preview. */
export async function previewOffer(eventId: string, slotId: string, personId: string | null, body: string) {
  const { e, slot, sender } = await offerParts(eventId, slotId);
  const p = personId ? await db.person.findFirst({ where: { id: personId, deletedAt: null }, select: personSelect }) : null;
  const who: PersonForText = p ?? { id: "", name: "Sam & Lena Ortiz", mailingName: null, legalNames: null, address: null, phones: [], emails: [] };
  const r = reminderText(body, who, e, slot, {}, sender);
  return { text: r.text, missing: r.missing, who: p ? p.name : "a sample contact (Sam & Lena Ortiz)" };
}

/**
 * Texts a game to people on the waitlist (owner request 2026-11-21: "who to text"): one text each, from the event's
 * sender, now (or 8am if it's after hours), as scheduled texts so they show on the contact and in Messages. Optionally
 * marks them Invited for that game. People who replied STOP or have no textable number are skipped and named.
 */
export async function offerGame(userId: string, eventId: string, slotId: string, personIds: string[], body: string, markInvited: boolean) {
  const { e, slot, senderId, sender } = await offerParts(eventId, slotId);
  if (!body.trim()) throw new UserError("Write the text.");
  const people = await db.person.findMany({ where: { id: { in: personIds }, deletedAt: null }, select: personSelect });
  if (!people.length) throw new UserError("Pick who to text.");
  const sendAt = nextSendTime();
  const skipped: string[] = [];
  let queued = 0;
  for (const p of people) {
    const numbers = [...new Set(p.phones.filter((x) => canText(x.label) && x.normalized.length === 10).map((x) => x.normalized))];
    if (!numbers.length) { skipped.push(`${p.name} (no textable number)`); continue; }
    if (await hasTextStop(p.id)) { skipped.push(`${p.name} (replied STOP)`); continue; }
    const text = reminderText(body, p, e, slot, {}, sender).text;
    // "evo:" keys aren't touched by syncEventReminders (they're one-off offers, not reminders).
    await db.scheduledText.create({ data: { personId: p.id, numbers, body: text, sendAt, createdById: senderId, eventKey: `evo:${e.id}:${slot.id}:${p.id}:${Date.now()}` } });
    queued++;
  }
  const sentTo = people.filter((p) => !skipped.some((x) => x.startsWith(`${p.name} (`))).map((p) => p.id);
  if (markInvited && sentTo.length) {
    for (const id of sentTo) {
      const had = await db.eventAttendee.findUnique({ where: { slotId_personId: { slotId: slot.id, personId: id } } });
      if (!had) await db.eventAttendee.create({ data: { eventId: e.id, slotId: slot.id, personId: id, status: "invited" } });
    }
    await syncEventReminders(e.id);
    await syncWaitlistTag(e.id);
  }
  await logActivity(userId, "create", "text", null, `Offered ${slotLine({ title: slot.title, date: isoFromDate(slot.date) }, e.name)} by text to ${queued} ${queued === 1 ? "person" : "people"}${skipped.length ? ` (${skipped.length} skipped)` : ""}`);
  for (const p of people) revalidatePath(`/people/${p.id}`);
  return { queued, skipped, when: quietNow() ? scheduleLabel(sendAt) : null };
}

// ---------- Importing who's going (the season spreadsheet) ----------

export type AssignmentPreview = { line: number; name: string; wait: string; slotId: string | null; game: string; candidates: { id: string; name: string; detail: string }[]; phone: string; email: string; seats: string; problem: string | null };

/** Reads the spreadsheet and finds each row's game and contact (matched by phone, email, or name), for review before saving. */
export async function previewAssignments(eventId: string, csv: string) {
  const e = await db.event.findFirst({ where: { id: eventId, deletedAt: null }, include: { slots: true } });
  if (!e) throw new UserError("That event was removed.");
  const { rows, problem, skipped } = readAssignmentCsv(csv);
  if (problem) throw new UserError(problem);
  const slots = e.slots.map((s) => ({ id: s.id, date: isoFromDate(s.date), opponent: s.opponent, title: s.title }));
  const people = await db.person.findMany({ where: { deletedAt: null }, select: { id: true, name: true, phones: { select: { normalized: true, number: true } }, emails: { select: { normalized: true } } } });
  const detail = (p: (typeof people)[number]) => p.phones[0]?.number ?? "";
  const out: AssignmentPreview[] = rows.map((r) => {
    const g = r.wait ? null : gameFor(r, slots);
    const digits = normalizePhone(r.phone);
    const byContact = people.filter((p) => (digits.length === 10 && p.phones.some((x) => x.normalized === digits)) || (r.email && p.emails.some((x) => x.normalized === r.email)));
    const found = byContact.length ? byContact : matchName(r.name, people);
    return { line: r.line, name: r.name, wait: r.wait, slotId: g?.id ?? null, game: r.wait ? `${e.waitlistLabel || "Waitlist"} (${r.wait})` : g ? slotLine(g, e.name) : `${r.date}${r.opponent ? ` ${r.opponent}` : ""}`,
      candidates: found.slice(0, 5).map((p) => ({ id: p.id, name: p.name, detail: detail(p) })), phone: r.phone, email: r.email, seats: r.seats,
      problem: r.wait || g ? null : `No game on ${r.date}${r.opponent ? ` vs ${r.opponent}` : ""} in this event. Import the dates first (Import dates; the same file works).` };
  });
  return { rows: out, skipped };
}

/** Saves the reviewed rows: each person on their game with the status picked; "new" makes a contact first. */
export async function applyAssignments(userId: string, eventId: string, items: { slotId: string | null; wait: string; personId: string | null; name: string; phone: string; email: string; seats: string }[], status: string) {
  const e = await db.event.findFirst({ where: { id: eventId, deletedAt: null }, include: { slots: true } });
  if (!e) throw new UserError("That event was removed.");
  let added = 0, updated = 0, created = 0, waiting = 0;
  const made = new Map<string, string>(); // a new contact named twice in the file is made once
  for (const it of items) {
    const slot = e.slots.find((s) => s.id === it.slotId);
    if (!slot && !it.wait) continue;
    let personId = it.personId ?? made.get(it.name.trim().toLowerCase()) ?? null;
    if (!personId) {
      const digits = normalizePhone(it.phone), email = it.email.trim().toLowerCase();
      const name = it.name.trim().slice(0, 120);
      if (!name) continue;
      personId = (await db.person.create({ data: { name, mailingName: name, createdById: userId,
        phones: digits.length === 10 ? { create: [{ label: "Mobile", number: formatPhone(digits), normalized: digits, position: 0 }] } : undefined,
        emails: email ? { create: [{ label: "", address: email, normalized: email, position: 0 }] } : undefined } })).id;
      made.set(name.toLowerCase(), personId);
      created++;
    }
    if (!slot) {
      // Interested column: onto the waitlist, its heading ("B Clients Interested") kept as the note.
      const had = await db.eventInterest.findUnique({ where: { eventId_personId: { eventId, personId } } });
      if (!had) { await db.eventInterest.create({ data: { eventId, personId, note: it.wait.slice(0, 200), source: "import" } }); waiting++; }
      revalidatePath(`/people/${personId}`);
      continue;
    }
    const had = await db.eventAttendee.findUnique({ where: { slotId_personId: { slotId: slot.id, personId } } });
    if (had) { if (had.status !== status) { await db.eventAttendee.update({ where: { id: had.id }, data: { status } }); updated++; } }
    else { await db.eventAttendee.create({ data: { eventId, slotId: slot.id, personId, status, source: "import" } }); added++; }
    if (it.seats && !slot.details) { await db.eventSlot.update({ where: { id: slot.id }, data: { details: it.seats.slice(0, 500) } }); slot.details = it.seats; }
    revalidatePath(`/people/${personId}`);
  }
  await logActivity(userId, "create", "event", eventId, `Imported who's going on "${e.name}" from a spreadsheet: ${added} added, ${updated} updated, ${waiting} onto the waitlist, ${created} new contacts`);
  await syncEventReminders(eventId);
  await syncWaitlistTag(eventId);
  return { added, updated, created, waiting };
}
