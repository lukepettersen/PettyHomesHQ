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
import { scheduleLabel } from "@/lib/scheduledText";
import {
  answerSummary, cleanAnswers, cleanFields, cleanTemplateReminders, eventMergeValues, NBA_HEADERS, nbaScheduleUrl, parseNbaSchedule, reminderSendAt, slotLine, statusLabel,
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
  return rows.map((t) => ({ id: t.id, name: t.name, type: t.type, multiSlot: t.multiSlot, doneLabel: t.doneLabel, location: t.location, intro: t.intro,
    fields: fieldsOf(t.fields), reminders: cleanTemplateReminders(t.reminders), events: t._count.events }));
}
export type TemplateView = Awaited<ReturnType<typeof loadTemplates>>[number];

export type TemplateInput = { id?: string | null; name: string; type: string; multiSlot: boolean; doneLabel: string; location: string; intro: string; fields: unknown; reminders: unknown };
export async function saveTemplate(userId: string, t: TemplateInput) {
  const data = { name: t.name.trim().slice(0, 120), type: t.type.trim().slice(0, 60), multiSlot: t.multiSlot, doneLabel: t.doneLabel.trim().slice(0, 40) || "Tickets sent",
    location: t.location.trim().slice(0, 200), intro: t.intro.trim().slice(0, 2000), fields: cleanFields(t.fields), reminders: cleanTemplateReminders(t.reminders) };
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
      location: t?.location ?? "", intro: t?.intro ?? "", senderId: sender?.id ?? userId, createdById: userId,
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
    slots: { orderBy: [{ date: "asc" }, { time: "asc" }], select: { date: true } },
    _count: { select: { attendees: true } },
  } });
  return rows.map((e) => {
    const next = e.slots.find((s) => s.date >= today) ?? null;
    const last = e.slots[e.slots.length - 1] ?? null;
    return { id: e.id, name: e.name, type: e.type, multiSlot: e.multiSlot, slots: e.slots.length, attendees: e._count.attendees, signupOn: e.signupOn,
      first: e.slots[0] ? isoFromDate(e.slots[0].date) : null, next: next ? isoFromDate(next.date) : null, last: last ? isoFromDate(last.date) : null };
  }).sort((a, b) => (a.next ? 0 : 1) - (b.next ? 0 : 1) || (a.next ?? b.last ?? "").localeCompare(b.next ?? a.last ?? ""));
}

export async function loadEvent(id: string) {
  const e = await db.event.findFirst({ where: { id, deletedAt: null }, include: {
    slots: { orderBy: [{ date: "asc" }, { time: "asc" }] },
    attendees: { orderBy: { createdAt: "asc" }, include: { person: { select: { id: true, name: true, deletedAt: true, phones: { orderBy: { position: "asc" }, select: { number: true, label: true } } } } } },
    reminders: { orderBy: [{ daysBefore: "desc" }, { time: "asc" }] },
  } });
  if (!e) return null;
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
    senderId: e.senderId, signupKey: e.signupKey, signupOn: e.signupOn, signupOpensAt: e.signupOpensAt?.toISOString() ?? null, signupClosesAt: e.signupClosesAt?.toISOString() ?? null,
    slots: e.slots.map((s) => ({ id: s.id, date: isoFromDate(s.date), time: s.time, title: s.title, opponent: s.opponent, location: s.location, details: s.details, imported: !!s.externalId })),
    attendees: e.attendees.filter((a) => !a.person.deletedAt).map((a) => ({ id: a.id, slotId: a.slotId, personId: a.person.id, name: a.person.name, status: a.status, source: a.source,
      answers: answersOf(a.answers), phone: a.person.phones.find((p) => canText(p.label))?.number ?? null })),
    reminders: e.reminders.map((r) => ({ id: r.id, name: r.name, body: r.body, daysBefore: r.daysBefore, time: r.time, statuses: r.statuses, active: r.active, ...counts(r.id) })),
    senders: team.map((u) => ({ id: u.id, name: u.name, number: formatPhone(u.textNumber!) })),
  };
}
export type EventView = NonNullable<Awaited<ReturnType<typeof loadEvent>>>;

export type EventInput = { name: string; type: string; location: string; notes: string; intro: string; doneLabel: string; fields: unknown; senderId: string | null };
export async function updateEvent(userId: string, id: string, v: EventInput) {
  const name = v.name.trim().slice(0, 120);
  if (!name) throw new UserError("Give the event a name.");
  if (v.senderId && !(await db.user.findFirst({ where: { id: v.senderId, textNumber: { not: null }, status: { not: "DISABLED" } } }))) throw new UserError("Pick someone with an HQ number to send the reminders.");
  const before = await db.event.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw new UserError("That event was removed.");
  await db.event.update({ where: { id }, data: { name, type: v.type.trim().slice(0, 60), location: v.location.trim().slice(0, 200), notes: v.notes.trim().slice(0, 4000), intro: v.intro.trim().slice(0, 2000),
    doneLabel: v.doneLabel.trim().slice(0, 40) || "Confirmed", fields: cleanFields(v.fields), senderId: v.senderId } });
  await logActivity(userId, "update", "event", id, `Edited event "${name}"${before.name !== name ? ` (was "${before.name}")` : ""}`);
  await syncEventReminders(id);
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
}

/** Dates from the NBA schedule or a spreadsheet: a game already there (same NBA id, or same date and title) is updated, not doubled. */
export async function importSlots(userId: string, eventId: string, slots: ImportedSlot[], how: string) {
  const e = await db.event.findFirst({ where: { id: eventId, deletedAt: null }, include: { slots: true } });
  if (!e) throw new UserError("That event was removed.");
  if (!e.multiSlot) throw new UserError("This event has a single date. Importing is for events with many dates.");
  let added = 0, updated = 0;
  for (const s of slots.slice(0, 200)) {
    const same = e.slots.find((x) => (s.externalId && x.externalId === s.externalId) || (!s.externalId && isoFromDate(x.date) === s.date && x.title.toLowerCase() === s.title.toLowerCase()));
    // Seats typed in HQ stay when the schedule is imported again.
    const data = { ...slotData({ ...s, details: s.details || same?.details || "", location: s.location || same?.location || "" }), externalId: s.externalId ?? same?.externalId ?? null };
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
  revalidatePath(`/people/${a.personId}`);
}

export async function removeAttendee(userId: string, id: string) {
  const a = await db.eventAttendee.findUnique({ where: { id }, include: { event: true, person: { select: { name: true } }, slot: true } });
  if (!a) return;
  await cancelEventTexts(a.eventId, { attendeeIds: [id] });
  await db.eventAttendee.delete({ where: { id } });
  await logActivity(userId, "delete", "event", a.eventId, `Took ${a.person.name} off ${slotLine({ title: a.slot.title, date: isoFromDate(a.slot.date) }, a.event.name)}`);
  revalidatePath(`/people/${a.personId}`);
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
  if (!slotIds.length) throw new UserError(e.multiSlot ? "Pick at least one game or date." : "This event doesn't have a date yet.");
  const answers = cleanAnswers(fieldsOf(e.fields), v.answers);
  await addAttendees(by, eventId, slotIds, [person.id], e.multiSlot ? "invited" : "confirmed", answers, "signup");
  const picked = e.slots.filter((s) => slotIds.includes(s.id)).map((s) => slotLine({ title: s.title, date: isoFromDate(s.date) }, e.name));
  const summary = answerSummary(fieldsOf(e.fields), answers);
  const long = fieldsOf(e.fields).filter((f) => f.type === "long" && answers[f.key]).map((f) => `${f.label}: ${answers[f.key]}`);
  await db.timelineEntry.create({ data: { personId: person.id, kind: "note", body: [`Signed up for ${e.name} (signup page)${e.multiSlot ? `: ${picked.join(", ")}` : ""}${summary ? ` · ${summary}` : ""}`, ...long].join("\n") } });
  const text = `Event signup: ${person.name}${existing ? "" : " (new contact)"} for ${e.name}${summary ? ` · ${summary}` : ""}${e.multiSlot ? ` · ${picked.length} ${picked.length === 1 ? "date" : "dates"}` : ""}`;
  // In everyone's bell; whether it pops up is each person's choice (My settings → Pop-up alerts → Event signups).
  const team = await db.user.findMany({ where: { status: { not: "DISABLED" } }, select: { id: true } });
  for (const u of team) await db.notification.create({ data: { toId: u.id, personId: person.id, alert: true, link: `/events/${e.id}`, text: text.slice(0, 300) } });
  return { personId: person.id, created: !existing };
}

export const remindersOf = (v: unknown): TemplateReminder[] => cleanTemplateReminders(v);
