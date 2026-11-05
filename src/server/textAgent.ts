import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/server/db";
import { UserError } from "@/server/safe";
import { isConnected } from "@/server/integrations";
import { logActivity } from "@/server/activity";
import { bookAppt } from "@/server/booking";
import { callChanged, consultChanged, redateConsult } from "@/server/automation";
import { addCalendarEvent, calendarConnection, removeCalendarEvent, syncAppointment } from "@/server/google";
import { sendTextAs } from "@/server/texting";
import { groupReady, textNumbersAsGroup } from "@/server/groupText";
import { hasPermission } from "@/server/permissions";
import { calendarHint } from "@/lib/assistant";
import { addMinutes, defaultTitle } from "@/lib/appointments";
import { dateFromIso, formatPhone, isoFromDate, normalizeEmail, normalizePhone, todayCentral } from "@/lib/normalize";
import { centralToUtc, scheduleLabel, scheduleProblem } from "@/lib/scheduledText";
import { formatTime, longIso } from "@/lib/tasks";
import { clip, cleanWhen } from "@/lib/textAgent";
import { loadContract, cleanOrThrow, saveContractAnswers } from "@/server/paEdit";
import { addBoardNote, removeBoardNote } from "@/server/whiteboard";
import { mergeContacts } from "@/server/mergePeople";
import { loadPaperConfig, requestPaperwork } from "@/server/paperwork";
import { allTypes, aOrAn, paperDetails, paperProblem, paperSchema, paperSteps, formName } from "@/lib/paperwork";
import { COMMISSION_KEYS, KEY_DATES, visibleSections, type PaField } from "@/lib/pa";

// The text assistant (owner request 2026-10-30): a team member texts their HQ number in plain English and Claude does it
// in HQ with these tools, then HQ texts back exactly what was done (written by HQ, not Claude, so it can't be wrong about
// it). Texting a client waits for a YES; "undo" reverses the last thing it did. What was texted is sent to Anthropic's
// API to read it; message bodies aren't logged.

const MODEL = "claude-opus-5-5";
const MAX_TURNS = 8;
const MEMORY_MIN = 30;

type Me = { id: string; name: string; email: string; permissions: string[]; cell: string };

const SYSTEM = `You are the text assistant for the Petty Homes real estate team's CRM, called HQ. A team member texts you from their phone; you do what they ask with the tools, then reply by text.

People:
- Use find_people to get a contact's id. Never make up ids. Couples are stored together ("Sam & Lena Ortiz"), so search one first name or the last name.
- If a name matches several contacts, or none, don't guess: do nothing for it and ask which one (list the names briefly).
- Use person_details to answer questions about a contact (phone, email, deal, dates, tasks) and to get appointment ids.

Calendar:
- book_event puts something on the calendar. With a contact, it goes on their HQ page too ("Jack Rotman swing by house today 10:30am" → person_id Jack's id, title "Swing by house"). With no contact in it ("dentist Fri 3pm", "block Thursday afternoon for MLS tour"), person_id is "".
- If they name someone not in HQ, ask whether to put it on the calendar by itself or add them as a contact; don't do both.
- add_contact adds someone new (find_people first so you don't add a duplicate). A couple or two people buying or selling together are ONE contact named like "Jack & Adonis Smith" (or "Jack Smith & Adonis Jones" when last names differ) with both phones and emails (labels like "Jack" / "Adonis"); never two contacts, unless the speaker asks for separate ones. When they give a name and a number or email to add, add it, then go on with what they asked in the same turn (e.g. add_contact, then text_client with the new id).
- date YYYY-MM-DD from the calendar you're given; start/end 24-hour HH:MM. No end said: leave end "" (HQ uses an hour). No time said for a meeting: ask. "All day" or a reminder with no time: start "".
- invite_client true when it's a meeting with the client (they'll get the calendar invite); false for things you do on your own (dropping off a sign, a reminder). Only list team members in with_team when the speaker says someone joins.
- move_event / cancel_event change an appointment; get its id from person_details or my_schedule first.

Other:
- add_task for reminders and to-dos (due today if no day is said). add_note to log what happened with a client, in the speaker's words, cleaned up, keeping every fact.
- text_client when they want someone texted. Write the message as the speaker would (first person, casual, short), greeting them by first name. It goes as a group text that includes the speaker's own cell, and is NOT sent until they reply YES, so call it once, then stop.
- my_schedule answers "what's on my calendar / today / tomorrow".
- add_to_whiteboard puts a sticky note on the speaker's private HQ whiteboard, for things to remember that aren't a task with a due date ("put on my board…", "remember…", "whiteboard: …"). Keep their words; a short list can be lines starting with "• ".
- Contracts (purchase agreements): contract_details shows a contact's active contract with every term (key, label, type, value). To change terms ("move Ortiz closing to 11/25", "price is now 395k", "inspection waived? no: inspection date Nov 8"), call edit_contract once with every change: the key from contract_details and the value in its format (date YYYY-MM-DD; datetime YYYY-MM-DDTHH:MM; money/number digits only; pct like 2.7; yesno "Yes"/"No"; choice exactly one of its choices; "" to clear). It is NOT saved until they reply YES, so stop after it. If a term isn't on the form, say so.
- Photos: they may text a photo or screenshot (a booking confirmation, a flyer, a showing request, a business card). Read it. A booking or appointment for them (haircut, dentist, a meeting) that isn't about a contact in HQ: book_event with person_id "", the date, start, end and address from the photo, invite_client false, and a short title naming what and where ("Haircut - Jesse's Barber Shop"). The photo's date wins over a vague "today" in their words. A business card or contact details: add_contact. A photo with no words: do what it plainly calls for; if that isn't clear, ask what they'd like done.
- Paperwork (ClickContracts forms written up by a teammate, usually Alyssa): "have Alyssa do a price change for Lach to 409,900", "need a listing contract for the Smiths". Call paperwork_forms with the contact first: it lists the forms, what each asks, the boxes on the Change form, and what HQ already knows from their deal. Then ask the speaker, in one short text, for anything the form needs that isn't known (e.g. the new price, the new expiration date, the off-market date), only what matters for what they asked. Then call request_paperwork once with every value (dates YYYY-MM-DD, money digits only). It is NOT sent until they reply YES, so stop after it. Leave blank anything nobody knows (like the MLS number); the teammate fills it in.
- combine_contacts merges two contacts into one (both kept as one: phones, emails, notes, tasks, deals); delete_contact moves one to Trash. Both wait for YES.
- You can't send emails or move deals between stages yet; say so if asked. Never describe HQ buttons or features you weren't told about here; if you can't do something, say so plainly.

Reply in one or two short plain sentences (no markdown, no lists), only what they need: an answer, or the one question you need answered. Don't repeat what the tools did: HQ texts that back itself.`;

const str = (d: string) => ({ type: "string" as const, description: d });
const tools: Anthropic.Beta.BetaTool[] = [
  { name: "find_people", description: "Search HQ contacts by name. Up to 8 matches with id, name and stage.", strict: true,
    input_schema: { type: "object", properties: { query: str("A name or part of one") }, required: ["query"], additionalProperties: false } },
  { name: "person_details", description: "A contact's phones, emails, address, stage, open deals with key dates, upcoming appointments (with ids) and open tasks.", strict: true,
    input_schema: { type: "object", properties: { person_id: str("Contact id") }, required: ["person_id"], additionalProperties: false } },
  { name: "my_schedule", description: "Appointments on a day (everyone's, with ids) and the speaker's tasks due that day.", strict: true,
    input_schema: { type: "object", properties: { date: str("YYYY-MM-DD") }, required: ["date"], additionalProperties: false } },
  { name: "book_event", description: "Put an event on the calendar, on a contact's page when person_id is set.", strict: true,
    input_schema: { type: "object", properties: {
      person_id: str('Contact id, or "" for an event that is not about a contact'), title: str("Short title, like \"Swing by house\" (no name: HQ adds their last name)"),
      date: str("YYYY-MM-DD"), start: str('HH:MM 24-hour, or "" for all day'), end: str('HH:MM 24-hour, or ""'), location: str('Address or place, or ""'),
      invite_client: { type: "boolean", description: "Send the contact a calendar invite" }, with_team: { type: "array", items: { type: "string" }, description: "First names of teammates joining (besides the speaker)" },
    }, required: ["person_id", "title", "date", "start", "end", "location", "invite_client", "with_team"], additionalProperties: false } },
  { name: "move_event", description: "Change an appointment's day and time.", strict: true,
    input_schema: { type: "object", properties: { appointment_id: str("From person_details or my_schedule"), date: str("YYYY-MM-DD"), start: str('HH:MM or ""'), end: str('HH:MM or ""') }, required: ["appointment_id", "date", "start", "end"], additionalProperties: false } },
  { name: "cancel_event", description: "Cancel (delete) an appointment; the calendar invite is cancelled too.", strict: true,
    input_schema: { type: "object", properties: { appointment_id: str("From person_details or my_schedule") }, required: ["appointment_id"], additionalProperties: false } },
  { name: "add_task", description: "Add a task (a to-do or reminder).", strict: true,
    input_schema: { type: "object", properties: {
      title: str("Short, plain"), person_id: str('Contact id, or ""'), due: str("YYYY-MM-DD"), time: str('HH:MM or ""'),
      assignee: str('Teammate first name, or "" for the speaker'), kind: { type: "string", enum: ["followup", "call", "text", "email", "showing", "other"] },
    }, required: ["title", "person_id", "due", "time", "assignee", "kind"], additionalProperties: false } },
  { name: "add_note", description: "Log a note, call or text on a contact's timeline.", strict: true,
    input_schema: { type: "object", properties: { person_id: str("Contact id"), kind: { type: "string", enum: ["note", "call", "text"] }, body: str("The note") }, required: ["person_id", "kind", "body"], additionalProperties: false } },
  { name: "add_contact", description: "Add a new contact to HQ. Returns the new id (or the existing contact's, if that number or email is already in HQ).", strict: true,
    input_schema: { type: "object", properties: {
      name: str('Full name, like "Mason Albee", or a couple: "Jack & Adonis Smith"'), phone: str('Phone number, or ""'), email: str('Email, or ""'),
      more_phones: { type: "array", items: { type: "object", properties: { number: str("Phone number"), label: str('Whose, like "Adonis", or ""') }, required: ["number", "label"], additionalProperties: false }, description: "Other phone numbers (e.g. the partner's)" },
      more_emails: { type: "array", items: { type: "string" }, description: "Other email addresses" },
      partner_type: { type: "string", enum: ["", "realtor", "lender", "title", "inspector", "tc", "attorney", "other"], description: 'Industry partner type when they say what they do (a contractor or sign installer is "other"), else ""' },
    }, required: ["name", "phone", "email", "more_phones", "more_emails", "partner_type"], additionalProperties: false } },
  { name: "combine_contacts", description: "Combine two contacts into one (phones, emails, notes, tasks, deals and texts all end up on the kept one; the other goes to Trash). Not done until the speaker replies YES.", strict: true,
    input_schema: { type: "object", properties: { keep_id: str("Contact id to keep"), other_id: str("Contact id to fold in"), name: str('Name for the combined contact, like "Jack & Adonis Smith", or "" to keep the name') }, required: ["keep_id", "other_id", "name"], additionalProperties: false } },
  { name: "delete_contact", description: "Move a contact to Trash (restorable for 30 days). Not done until the speaker replies YES.", strict: true,
    input_schema: { type: "object", properties: { person_id: str("Contact id") }, required: ["person_id"], additionalProperties: false } },
  { name: "add_to_whiteboard", description: "Add a sticky note to the speaker's private whiteboard in HQ.", strict: true,
    input_schema: { type: "object", properties: { text: str("What the note says, in their words"), color: { type: "string", enum: ["yellow", "green", "pink", "blue", "orange"] } }, required: ["text", "color"], additionalProperties: false } },
  { name: "contract_details", description: "A contact's active purchase agreement(s): id, address, side, key dates with status, and every term on the form as key / label / type / value (choices listed).", strict: true,
    input_schema: { type: "object", properties: { person_id: str("Contact id") }, required: ["person_id"], additionalProperties: false } },
  { name: "edit_contract", description: "Prepare changes to a purchase agreement's terms. Not saved until the speaker replies YES.", strict: true,
    input_schema: { type: "object", properties: { contract_id: str("From contract_details"), changes: { type: "array", items: { type: "object", properties: { key: str("The term's key from contract_details"), value: str("The new value in the term's format, or \"\" to clear") }, required: ["key", "value"], additionalProperties: false } } }, required: ["contract_id", "changes"], additionalProperties: false } },
  { name: "paperwork_forms", description: "The paperwork forms a teammate can write up in ClickContracts (key, name, fields, Change form boxes), what HQ already knows from this contact's deal, and who it can go to.", strict: true,
    input_schema: { type: "object", properties: { person_id: str("Contact id") }, required: ["person_id"], additionalProperties: false } },
  { name: "request_paperwork", description: "Prepare a paperwork request for a teammate (a task due now, with the form's steps, and a text to them). Not sent until the speaker replies YES.", strict: true,
    input_schema: { type: "object", properties: {
      person_id: str("Contact id"), form: str("Form key from paperwork_forms"),
      values: { type: "array", items: { type: "object", properties: { key: str("Field key from paperwork_forms"), value: str("The value: date YYYY-MM-DD, money digits only") }, required: ["key", "value"], additionalProperties: false } },
      checks: { type: "array", items: str("Change form box key (price, expiration, temp, active, cancelled, other)") },
      notes: str('Anything else for the teammate, or ""'), send_to: str('Teammate user id from paperwork_forms, or "" for the usual one'),
    }, required: ["person_id", "form", "values", "checks", "notes", "send_to"], additionalProperties: false } },
  { name: "text_client", description: "Prepare a text to a contact from the speaker's HQ number. Not sent until the speaker replies YES.", strict: true,
    input_schema: { type: "object", properties: { person_id: str("Contact id"), body: str("The message"), send_date: str('YYYY-MM-DD to send later, or "" for now'), send_time: str('HH:MM to send later, or ""') }, required: ["person_id", "body", "send_date", "send_time"], additionalProperties: false } },
];

const record = (userId: string, kind: string, summary: string, payload: object, status = "done") =>
  db.textAgentAction.create({ data: { userId, kind, summary, payload: payload as object, status } });

const when = (date: string, start: string | null, end?: string | null) => `${longIso(date)}${start ? ` ${formatTime(start)}${end ? `–${formatTime(end)}` : ""}` : " (all day)"}`;

/** Runs one tool. Returns what Claude sees; done/confirm actions are recorded for the reply, undo and YES. */
async function runTool(me: Me, name: string, a: Record<string, unknown>, seen: Set<string>, today: string): Promise<string> {
  const s = (k: string) => (typeof a[k] === "string" ? (a[k] as string).trim() : "");
  const person = async (id: string) => (id && seen.has(id) ? db.person.findFirst({ where: { id, deletedAt: null }, include: { emails: { orderBy: { position: "asc" } }, phones: { orderBy: { position: "asc" } }, tags: { include: { tag: true } } } }) : null);

  if (name === "find_people") {
    const words = s("query").split(/\s+/).filter((w) => w.length > 1).slice(0, 4);
    if (!words.length) return "No contacts match.";
    const rows = await db.person.findMany({ where: { deletedAt: null, AND: words.map((w) => ({ name: { contains: w, mode: "insensitive" as const } })) }, orderBy: { updatedAt: "desc" }, take: 8, select: { id: true, name: true, stage: { select: { name: true } }, company: true } });
    rows.forEach((r) => seen.add(r.id));
    return rows.length ? JSON.stringify(rows.map((r) => ({ id: r.id, name: r.name, stage: r.stage?.name ?? null, company: r.company ?? undefined }))) : "No contacts match that name.";
  }

  if (name === "person_details") {
    const p = await person(s("person_id"));
    if (!p) return "Unknown contact id: use find_people first.";
    const [files, appts, tasks] = await Promise.all([
      db.clientFile.findMany({ where: { personId: p.id, deletedAt: null, closedAt: null }, include: { status: { select: { name: true } }, contracts: { where: { state: "active", deletedAt: null }, take: 1 } } }),
      db.appointment.findMany({ where: { personId: p.id, deletedAt: null, date: { gte: dateFromIso(today) } }, orderBy: [{ date: "asc" }, { start: "asc" }], take: 6 }),
      db.task.findMany({ where: { personId: p.id, completedAt: null, deletedAt: null }, orderBy: [{ dueDate: "asc" }], take: 6, select: { title: true, dueDate: true } }),
    ]);
    const d = (x: Date | null) => (x ? isoFromDate(x) : null);
    return JSON.stringify({
      name: p.name, address: p.address, phones: p.phones.map((x) => `${x.number}${x.label ? ` (${x.label})` : ""}`), emails: p.emails.map((x) => x.address),
      textsBlocked: p.tags.some((t) => /text unsubscribed/i.test(t.tag.name)),
      deals: files.map((f) => { const pa = f.contracts[0]; return { kind: f.kind === "listing" ? "seller" : "buyer", stage: f.status?.name ?? null, ...(pa ? { underContract: pa.address, finalAcceptance: d(pa.finalAcceptance), inspection: d(pa.inspection), closing: d(pa.closing) } : {}) }; }),
      upcoming: appts.map((x) => ({ id: x.id, title: x.title, date: isoFromDate(x.date), start: x.start })),
      openTasks: tasks.map((t) => ({ title: t.title, due: d(t.dueDate) })),
    });
  }

  if (name === "my_schedule") {
    const w = cleanWhen(a.date, "");
    if (!w) return "Give date as YYYY-MM-DD.";
    const [appts, tasks] = await Promise.all([
      db.appointment.findMany({ where: { deletedAt: null, date: dateFromIso(w.date), person: { deletedAt: null } }, orderBy: { start: "asc" }, include: { person: { select: { id: true, name: true } } } }),
      db.task.findMany({ where: { assigneeId: me.id, completedAt: null, deletedAt: null, dueDate: dateFromIso(w.date) }, orderBy: { dueTime: "asc" }, take: 15, include: { person: { select: { name: true } } } }),
    ]);
    appts.forEach((x) => seen.add(x.person.id));
    return JSON.stringify({ appointments: appts.map((x) => ({ id: x.id, title: x.title, with: x.person.name, start: x.start, end: x.end })), myTasks: tasks.map((t) => ({ title: t.title, time: t.dueTime, person: t.person?.name ?? null })) });
  }

  if (name === "book_event") {
    const w = cleanWhen(a.date, a.start);
    const title = s("title").slice(0, 120);
    if (!w || !title) return "Not booked: needs a title and date (YYYY-MM-DD).";
    if (w.date < today) return "Not booked: that day has passed.";
    const end = w.time ? (cleanWhen(a.date, a.end)?.time ?? addMinutes(w.time, 60)) : null;
    const team = await db.user.findMany({ where: { status: { not: "DISABLED" } }, select: { name: true, email: true } });
    const joining = (Array.isArray(a.with_team) ? a.with_team : []).filter((x): x is string => typeof x === "string").map((f) => team.find((u) => u.name.split(/\s+/)[0].toLowerCase() === f.toLowerCase())).filter((u): u is { name: string; email: string } => !!u && u.name !== me.name);
    const pid = s("person_id");
    if (pid) {
      const p = await person(pid);
      if (!p) return "Unknown contact id: use find_people first.";
      // Named like every other appointment: "Schultz - Swing by" (owner request 2026-10-30).
      const prefix = defaultTitle(p.name, "other");
      const named = (title.toLowerCase().startsWith(prefix.toLowerCase()) ? title : `${prefix}${title}`).slice(0, 120);
      const r = await bookAppt(me.id, { personId: p.id, type: "other", title: named, date: w.date, start: w.time, end, location: s("location").slice(0, 300),
        invitees: [...(a.invite_client === true ? p.emails.map((e) => e.address) : []), me.name, ...joining.map((u) => u.name)] });
      const invite = (await calendarConnection()) ? (a.invite_client === true && p.emails.length ? " Invite sent to them." : " On your calendar.") : "";
      await record(me.id, "appt", `✓ Booked "${named}" with ${p.name}, ${when(w.date, w.time, end)}.${invite}`, { appointmentId: r.id });
      return `Booked (appointment id ${r.id}).`;
    }
    const id = await addCalendarEvent({ title, date: w.date, start: w.time, end, location: s("location").slice(0, 300), guests: [{ email: me.email, name: me.name }, ...joining] });
    if (!id) return "Not added: Google Calendar isn't connected or didn't respond (Admin → Integrations). Tell them it wasn't added.";
    await logActivity(me.id, "create", "calendarEvent", null, `Added "${title}" to the calendar by text`);
    await record(me.id, "event", `✓ Added "${title}" to your calendar, ${when(w.date, w.time, end)}.`, { eventId: id });
    return "Added to the calendar.";
  }

  if (name === "move_event" || name === "cancel_event") {
    const appt = await db.appointment.findFirst({ where: { id: s("appointment_id"), deletedAt: null }, include: { person: { select: { name: true, deletedAt: true } } } });
    if (!appt || appt.person.deletedAt) return "Unknown appointment id: look it up with person_details or my_schedule.";
    const before = { date: isoFromDate(appt.date), start: appt.start, end: appt.end };
    if (name === "cancel_event") {
      await db.appointment.update({ where: { id: appt.id }, data: { deletedAt: new Date() } });
      const removed = appt.type === "call" ? await callChanged(db, appt.personId, me.id)
        : appt.type === "buyer" || appt.type === "seller" ? await consultChanged(db, appt.personId, me.id) : [];
      await syncAppointment(appt.id);
      await logActivity(me.id, "delete", "appointment", appt.id, `Deleted appointment "${appt.title}" by text`);
      await record(me.id, "cancelAppt", `✓ Cancelled "${appt.title}" with ${appt.person.name} (${when(before.date, before.start)}).${removed.length ? ` Removed ${removed.length} checklist step${removed.length === 1 ? "" : "s"} for it.` : ""}`, { appointmentId: appt.id, removed });
      return "Cancelled.";
    }
    const w = cleanWhen(a.date, a.start);
    if (!w) return "Not moved: give date YYYY-MM-DD.";
    const end = w.time ? (cleanWhen(a.date, a.end)?.time ?? (appt.start && appt.end ? addMinutes(w.time, minutesBetween(appt.start, appt.end)) : addMinutes(w.time, 60))) : null;
    await db.appointment.update({ where: { id: appt.id }, data: { date: dateFromIso(w.date), start: w.time, end } });
    if (appt.type === "buyer" || appt.type === "seller") await redateConsult(db, appt.personId);
    if (appt.type === "call") await callChanged(db, appt.personId, me.id);
    await syncAppointment(appt.id);
    await logActivity(me.id, "update", "appointment", appt.id, `Moved "${appt.title}" to ${when(w.date, w.time)} by text`);
    await record(me.id, "moveAppt", `✓ Moved "${appt.title}" with ${appt.person.name} to ${when(w.date, w.time, end)}.`, { appointmentId: appt.id, before });
    return "Moved.";
  }

  if (name === "add_task") {
    const w = cleanWhen(a.due, a.time) ?? { date: today, time: null };
    const title = s("title").slice(0, 200);
    if (!title) return "Not added: needs a title.";
    const pid = s("person_id");
    const p = pid ? await person(pid) : null;
    if (pid && !p) return "Unknown contact id: use find_people first.";
    const who = s("assignee") ? await db.user.findFirst({ where: { status: { not: "DISABLED" }, name: { startsWith: s("assignee"), mode: "insensitive" } }, select: { id: true, name: true } }) : null;
    const kind = ["followup", "call", "text", "email", "showing", "other"].includes(s("kind")) ? s("kind") : "followup";
    const t = await db.task.create({ data: { title, kind, personId: p?.id ?? null, assigneeId: who?.id ?? me.id, dueDate: dateFromIso(w.date), dueTime: w.time, createdById: me.id } });
    await logActivity(me.id, "create", "task", t.id, `Added task "${title}" by text`);
    await record(me.id, "task", `✓ Task: "${title}"${p ? ` for ${p.name}` : ""}, ${when(w.date, w.time).replace(" (all day)", "")}${who && who.id !== me.id ? ` (${who.name.split(" ")[0]})` : ""}.`, { taskId: t.id });
    return "Task added.";
  }

  if (name === "add_note") {
    const p = await person(s("person_id"));
    const body = s("body").slice(0, 4000);
    if (!p || !body) return "Not saved: needs a contact id from find_people and the note.";
    const kind = ["note", "call", "text"].includes(s("kind")) ? s("kind") : "note";
    const e = await db.timelineEntry.create({ data: { personId: p.id, kind, body, authorId: me.id } });
    if (kind !== "note") await db.person.update({ where: { id: p.id }, data: { lastContactAt: new Date() } });
    await logActivity(me.id, "create", "timelineEntry", p.id, `Added a ${kind === "note" ? "note" : `logged ${kind}`} for ${p.name} by text`);
    await record(me.id, "note", `✓ ${kind === "note" ? "Note" : `Logged ${kind}`} saved on ${p.name}'s page.`, { entryId: e.id });
    return "Saved.";
  }

  if (name === "add_contact") {
    const full = s("name").replace(/\s+/g, " ").slice(0, 120);
    const okEmail = (x: string) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.trim()) ? normalizeEmail(x) : "");
    const extra = Array.isArray(a.more_phones) ? (a.more_phones as { number?: unknown; label?: unknown }[]).map((x) => ({ n: normalizePhone(String(x.number ?? "")), label: String(x.label ?? "").trim().slice(0, 40) })).filter((x) => x.n) : [];
    const phones = [{ n: normalizePhone(s("phone")), label: "" }, ...extra].filter((x, i, all) => x.n && all.findIndex((y) => y.n === x.n) === i);
    const emails = [...new Set([okEmail(s("email")), ...(Array.isArray(a.more_emails) ? (a.more_emails as unknown[]).map((x) => okEmail(String(x))) : [])].filter(Boolean))];
    if (!full) return "Not added: needs a name.";
    if (phones.some((x) => x.n.length !== 10)) return "Not added: a phone number doesn't look right; ask for it again.";
    const existing = phones.length || emails.length ? await db.person.findFirst({ where: { deletedAt: null, OR: [...phones.map((x) => ({ phones: { some: { normalized: x.n } } })), ...emails.map((e) => ({ emails: { some: { normalized: e } } }))] }, select: { id: true, name: true } }) : null;
    if (existing) { seen.add(existing.id); return `Already in HQ as ${existing.name} (id ${existing.id}); use that.`; }
    const type = s("partner_type");
    const p = await db.person.create({ data: {
      name: full, mailingName: full, createdById: me.id, assignedToId: me.id, partnerType: type || null,
      phones: phones.length ? { create: phones.map((x, i) => ({ label: x.label || "Mobile", number: formatPhone(x.n), normalized: x.n, position: i })) } : undefined,
      emails: emails.length ? { create: emails.map((e, i) => ({ label: "", address: e, normalized: e, position: i })) } : undefined,
    } });
    seen.add(p.id);
    await logActivity(me.id, "create", "person", p.id, `Added ${full} by text`);
    await record(me.id, "contact", `✓ Added ${full} to HQ${phones.length ? ` (${phones.map((x) => formatPhone(x.n)).join(", ")})` : ""}${emails.length ? ` · ${emails.join(", ")}` : ""}.`, { personId: p.id });
    return `Added (id ${p.id}).`;
  }

  if (name === "combine_contacts" || name === "delete_contact") {
    const ids = name === "combine_contacts" ? [s("keep_id"), s("other_id")] : [s("person_id")];
    const people = await Promise.all(ids.map((id) => person(id)));
    if (people.some((x) => !x)) return "Unknown contact id: use find_people first.";
    if (name === "delete_contact") {
      await record(me.id, "deleteContact", `Move ${people[0]!.name} to Trash (restorable for 30 days)?\nReply YES to delete, or NO.`, { personId: people[0]!.id }, "confirm");
      return "Prepared. Waiting for them to reply YES. Stop here.";
    }
    if (ids[0] === ids[1]) return "Those are the same contact.";
    const newName = s("name").slice(0, 120);
    await record(me.id, "merge", `Combine ${people[1]!.name} into ${people[0]!.name}${newName && newName !== people[0]!.name ? ` and name it ${newName}` : ""}? Their phones, emails, notes, tasks and deals will all be on one contact; the other goes to Trash.\nReply YES to combine, or NO.`,
      { keepId: ids[0], goneId: ids[1], name: newName }, "confirm");
    return "Prepared. Waiting for them to reply YES. Stop here.";
  }

  if (name === "add_to_whiteboard") {
    const text = s("text").slice(0, 2000);
    if (!text) return "Not added: what should the note say?";
    const color = ["yellow", "green", "pink", "blue", "orange"].indexOf(s("color"));
    try {
      const noteId = await addBoardNote(me.id, text, Math.max(0, color));
      await logActivity(me.id, "update", "whiteboard", null, "Added a sticky note to their whiteboard by text");
      await record(me.id, "whiteboard", `✓ Added to your whiteboard: "${clip(text, 80)}"`, { noteId });
      return "Added.";
    } catch (e) { return `Not added: ${e instanceof Error ? e.message : "something went wrong"}`; }
  }

  if (name === "contract_details") {
    const p = await person(s("person_id"));
    if (!p) return "Unknown contact id: use find_people first.";
    const pas = await db.purchaseAgreement.findMany({ where: { state: "active", deletedAt: null, file: { personId: p.id, deletedAt: null } }, select: { id: true } });
    if (!pas.length) return `${p.name} has no active purchase agreement.`;
    const out = [];
    for (const { id } of pas) {
      const c = await loadContract(id, me.permissions);
      if (!c) continue;
      seen.add(id);
      const fields = visibleSections(c.form, c.answers).flatMap((sec) => sec.fields).filter((f) => c.view.commission !== null || !COMMISSION_KEYS.includes(f.key));
      out.push({ id, side: c.view.side, address: c.view.address,
        dates: Object.fromEntries(KEY_DATES.map(([k, l]) => [l, c.view.dates[k] ? `${c.view.dates[k]} (${c.view.dateStatus[k] ?? "pending"})` : null])),
        terms: fields.map((f) => ({ key: f.key, label: f.label, type: f.type, value: c.answers[f.key] ?? "", ...(f.options ? { choices: f.options } : {}) })) });
    }
    return JSON.stringify(out);
  }

  if (name === "edit_contract") {
    const paId = s("contract_id");
    if (!seen.has(paId)) return "Unknown contract id: use contract_details first.";
    const c = await loadContract(paId, me.permissions);
    if (!c) return "That contract was deleted.";
    const raw = Array.isArray(a.changes) ? (a.changes as { key?: unknown; value?: unknown }[]) : [];
    const changes = raw.map((x) => ({ key: String(x.key ?? "").trim(), value: String(x.value ?? "").trim().slice(0, 300) })).filter((x) => x.key).slice(0, 20);
    if (!changes.length) return "Not prepared: no changes given.";
    const next = { ...c.answers };
    for (const ch of changes) next[ch.key] = ch.value;
    const all = c.form.flatMap((sec) => sec.fields);
    const unknown = changes.filter((ch) => !all.some((f) => f.key === ch.key) || (c.view.commission === null && COMMISSION_KEYS.includes(ch.key)));
    if (unknown.length) return `Not prepared: ${unknown.map((u) => u.key).join(", ")} isn't a term on this contract's form. Check contract_details.`;
    try { cleanOrThrow(c.form, next, c.view.commission !== null); } catch (e) { return `Not prepared: ${e instanceof UserError ? e.message : "that value doesn't fit"}. Fix the value and try again.`; }
    const lines = changes.map((ch) => { const f = all.find((x) => x.key === ch.key)!; return `${f.label}: ${termText(f, c.answers[ch.key])} → ${termText(f, ch.value)}`; });
    await record(me.id, "contract", `Change ${c.pa.file.person.name}'s contract (${c.view.address}):\n${lines.join("\n")}\nReply YES to save, or NO.`, { paId, changes, lines }, "confirm");
    return "Prepared. Waiting for them to reply YES. Stop here.";
  }

  if (name === "paperwork_forms") {
    const p = await person(s("person_id"));
    if (!p) return "Unknown contact id: use find_people first.";
    const [{ custom }, files, team] = await Promise.all([
      loadPaperConfig(),
      db.clientFile.findMany({ where: { personId: p.id, deletedAt: null, closedAt: null }, orderBy: { createdAt: "desc" }, include: { contracts: { where: { state: "active", deletedAt: null }, take: 1 } } }),
      db.user.findMany({ where: { status: { not: "DISABLED" } }, orderBy: [{ isOwner: "asc" }, { name: "asc" }], select: { id: true, name: true, isOwner: true } }),
    ]);
    const f = files.find((x) => x.kind === "listing") ?? files[0];
    const info = (f?.info ?? {}) as Record<string, string>;
    const pa = f?.contracts[0];
    const known = f ? { address: pa?.address ?? f.address ?? "", price: String(pa?.price ?? f.price ?? ""), lcDate: info.lcSigned ?? "", oldExpires: info.lcExpires ?? "", mls: info.mls ?? "" } : {};
    return JSON.stringify({
      client: p.name, deal: f ? (f.kind === "listing" ? "seller" : "buyer") : "none", known,
      forms: allTypes(custom).map((t) => ({ key: t.key, name: t.label, fields: t.fields.map((x) => ({ key: x.key, label: x.label, type: x.type, ...(x.when ? { onlyWhenChecked: x.when } : {}) })), ...(t.options ? { boxes: t.options.map((o) => ({ key: o.key, label: o.label })) } : {}) })),
      sendTo: team.filter((u) => u.id !== me.id).map((u) => ({ id: u.id, name: u.name, usual: !u.isOwner })),
    });
  }

  if (name === "request_paperwork") {
    const p = await person(s("person_id"));
    if (!p) return "Unknown contact id: use find_people first.";
    const raw = Array.isArray(a.values) ? (a.values as { key?: unknown; value?: unknown }[]) : [];
    const values: Record<string, string> = Object.fromEntries(raw.map((x) => [String(x.key ?? "").trim(), String(x.value ?? "").trim().slice(0, 500)]).filter(([k]) => k));
    const checks = Array.isArray(a.checks) ? (a.checks as unknown[]).map(String) : [];
    if (checks.length) values.checks = checks.join(",");
    const parsed = paperSchema.safeParse({ type: s("form"), values, notes: s("notes") });
    if (!parsed.success) return "Not prepared: unknown form. Use a key from paperwork_forms.";
    const req = parsed.data;
    const { steps, custom } = await loadPaperConfig();
    const problem = paperProblem(req, custom);
    if (problem) return `Not prepared: ${problem}`;
    const team = await db.user.findMany({ where: { status: { not: "DISABLED" }, id: { not: me.id } }, orderBy: [{ isOwner: "asc" }, { name: "asc" }], select: { id: true, name: true } });
    const to = team.find((u) => u.id === s("send_to")) ?? team[0];
    if (!to) return "There's nobody else on the team to send it to; tell them.";
    const d = paperDetails(req, custom);
    const n = paperSteps(req, p.name, steps, custom).length;
    await record(me.id, "paperwork", `Ask ${to.name.split(" ")[0]} for ${aOrAn(formName(req, custom))} for ${p.name}:\n${d}${n ? `\n(${n} steps on the task)` : ""}\nReply YES to send, or NO.`, { personId: p.id, toId: to.id, request: req }, "confirm");
    return "Prepared. Waiting for them to reply YES. Stop here.";
  }

  if (name === "text_client") {
    if (!hasPermission(me.permissions as never, "sendTexts")) return "They aren't allowed to send texts from HQ; tell them.";
    const p = await person(s("person_id"));
    const body = s("body").slice(0, 1200);
    if (!p || !body) return "Not prepared: needs a contact id and the message.";
    if (p.tags.some((t) => /text unsubscribed/i.test(t.tag.name))) return `${p.name} replied STOP, so HQ can't text them; tell the speaker.`;
    if (!p.phones.length) return `${p.name} has no phone number in HQ; tell the speaker.`;
    const later = s("send_date") ? cleanWhen(a.send_date, a.send_time) : null;
    if (later) {
      const problem = later.time ? scheduleProblem(later.date, later.time) : "Pick a time for a scheduled text.";
      if (problem) return `Not prepared: ${problem}`;
    }
    const at = later?.time ? ` at ${scheduleLabel(centralToUtc(later.date, later.time))}` : "";
    const group = me.cell && !p.phones.some((x) => x.normalized === me.cell) ? " + your cell" : "";
    await record(me.id, "text", `${group ? "Group text" : "Text"} to ${p.name}${group}${at}: "${body}"\nReply YES to send, or NO.`, { personId: p.id, body, date: later?.date ?? null, time: later?.time ?? null }, "confirm");
    return "Prepared. Waiting for them to reply YES. Stop here.";
  }
  return "Unknown tool.";
}

/** A term's value the way a person reads it: "Fri, Nov 20", "$395,000", "2.7%", or "blank". */
function termText(f: PaField, v: string | undefined): string {
  if (!v) return "blank";
  if ((f.type === "date" || f.type === "date-na") && /^\d{4}-\d{2}-\d{2}$/.test(v)) return longIso(v);
  if (f.type === "datetime" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return `${longIso(v.slice(0, 10))} ${formatTime(v.slice(11, 16))}`;
  if (f.type === "money" && /^\d+$/.test(v.replace(/[$,]/g, ""))) return `$${Number(v.replace(/[$,]/g, "")).toLocaleString("en-US")}`;
  if (f.type === "pct") return `${v.replace(/%$/, "")}%`;
  return v;
}

const minutesBetween = (a: string, b: string) => { const [h1, m1] = a.split(":").map(Number), [h2, m2] = b.split(":").map(Number); return Math.max(15, h2 * 60 + m2 - (h1 * 60 + m1)); };

/** A plain-English text from a team member's cell. Returns the reply to text back. */
export type Photo = { type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string };

export async function runTextAgent(user: { id: string; name: string }, text: string, photos: Photo[] = []): Promise<string> {
  if (!isConnected("claude")) return 'HQ\'s assistant isn\'t connected yet (ANTHROPIC_API_KEY in Railway). You can still text "task …" or "contact …".';
  const u = await db.user.findUnique({ where: { id: user.id }, include: { role: true } });
  if (!u?.isOwner) return "Couldn't find you in HQ."; // owner only (owner decision 2026-10-30); the router checks this too
  const me: Me = { id: u.id, name: u.name, email: u.email, permissions: u.role.permissions, cell: u.forwardTo ? normalizePhone(u.forwardTo) : "" };
  const today = isoFromDate(todayCentral());
  const nowTime = new Date().toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" });
  const team = await db.user.findMany({ where: { status: { not: "DISABLED" } }, select: { name: true } });
  const memory = await db.textAgentTurn.findMany({ where: { userId: me.id, createdAt: { gte: new Date(Date.now() - MEMORY_MIN * 60000) } }, orderBy: { createdAt: "asc" }, take: 12 });
  const words = text.trim() || (photos.length ? "(sent a photo with no words)" : "");
  await db.textAgentTurn.create({ data: { userId: me.id, role: "user", text: `${words.slice(0, 2000)}${photos.length ? ` [${photos.length} photo${photos.length === 1 ? "" : "s"}]` : ""}` } });

  const context = `${calendarHint(today)} It's ${nowTime} Central.\nSpeaker: ${me.name}. Team: ${team.map((t) => t.name).join(", ")}.`;
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...memory.map((m) => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), content: m.text })),
    { role: "user", content: photos.length
      ? [...photos.map((p) => ({ type: "image" as const, source: { type: "base64" as const, media_type: p.type, data: p.data } })), { type: "text" as const, text: `${context}\n\nText (with ${photos.length === 1 ? "the photo above" : "the photos above"}): ${words}` }]
      : `${context}\n\nText: ${words}` },
  ];
  // Claude needs turns to alternate; merge any two in a row from the same side.
  const blocks = (c: Anthropic.Beta.BetaMessageParam["content"]) => (typeof c === "string" ? [{ type: "text" as const, text: c }] : c);
  const merged = messages.reduce<Anthropic.Beta.BetaMessageParam[]>((out, m) => {
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content = typeof last.content === "string" && typeof m.content === "string" ? `${last.content}\n${m.content}` : [...blocks(last.content), ...blocks(m.content)];
    else out.push({ ...m });
    return out;
  }, []);
  if (merged[0]?.role === "assistant") merged.shift();

  const client = new Anthropic({ maxRetries: 2, timeout: 60000 });
  const seen = new Set<string>();
  const started = new Date();
  let said = "";
  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const res = await client.beta.messages.create({ model: MODEL, max_tokens: 4000, system: SYSTEM, tools, messages: merged, output_config: { effort: "low" }, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
      if (res.stop_reason === "refusal") { said = "I can't help with that one."; break; }
      said = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join(" ").trim() || said;
      const uses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (res.stop_reason !== "tool_use" || !uses.length) break;
      merged.push({ role: "assistant", content: res.content });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const x of uses) {
        let out: string;
        try { out = await runTool(me, x.name, (x.input ?? {}) as Record<string, unknown>, seen, today); }
        catch (e) { out = e instanceof UserError ? `Didn't work: ${e.message}` : "Didn't work: something went wrong in HQ."; if (!(e instanceof UserError)) console.error("Text assistant tool failed:", x.name, e instanceof Error ? e.name : "error"); }
        results.push({ type: "tool_result", tool_use_id: x.id, content: out });
      }
      merged.push({ role: "user", content: results });
    }
  } catch (e) {
    console.error("Text assistant failed:", e instanceof Anthropic.APIError ? e.status : e instanceof Error ? e.name : "error");
    return 'HQ\'s assistant couldn\'t answer just now. Try again in a minute, or text "task …".';
  }
  // HQ writes what was done, so the receipt is always right; Claude's words cover answers and questions.
  const acts = await db.textAgentAction.findMany({ where: { userId: me.id, createdAt: { gte: started } }, orderBy: { createdAt: "asc" } });
  const confirm = acts.find((x) => x.status === "confirm");
  const done = acts.filter((x) => x.status === "done").map((x) => x.summary);
  const reply = clip(confirm ? [...done, confirm.summary].join("\n") : done.length ? [...done, said && !/^(done|booked|added|saved)\b/i.test(said) ? said : ""].filter(Boolean).join("\n") : said || "Sorry, I didn't catch that. Try again?");
  await db.textAgentTurn.create({ data: { userId: me.id, role: "assistant", text: reply } });
  return reply;
}

/** The latest text waiting on YES (last 30 minutes), for routing a YES / NO. */
export const pendingConfirm = (userId: string) => db.textAgentAction.findFirst({ where: { userId, status: "confirm", createdAt: { gte: new Date(Date.now() - 30 * 60000) } }, orderBy: { createdAt: "desc" } });

/** YES sends (or schedules) the prepared text; NO drops it. */
export async function answerConfirm(user: { id: string; name: string }, actionId: string, yes: boolean): Promise<string> {
  const claim = await db.textAgentAction.updateMany({ where: { id: actionId, status: "confirm" }, data: { status: yes ? "done" : "canceled" } });
  if (!claim.count) return "That one was already handled.";
  const act = await db.textAgentAction.findUniqueOrThrow({ where: { id: actionId } });
  if (act.kind === "merge" || act.kind === "deleteContact") {
    const q = act.payload as { keepId?: string; goneId?: string; name?: string; personId?: string };
    if (!yes) return act.kind === "merge" ? "Okay, not combined." : "Okay, not deleted.";
    try {
      if (act.kind === "merge") {
        const name = await mergeContacts(user.id, q.keepId!, q.goneId!, q.name);
        return `✓ Combined into one contact: ${name}. The other one is in Trash.`;
      }
      const p = await db.person.update({ where: { id: q.personId!, deletedAt: null }, data: { deletedAt: new Date() } });
      await logActivity(user.id, "delete", "person", p.id, `Moved ${p.name} to Trash by text`);
      return `✓ Moved ${p.name} to Trash. Text "undo" to put them back.`;
    } catch (e) {
      await db.textAgentAction.update({ where: { id: act.id }, data: { status: "canceled" } });
      return `Not done: ${e instanceof Error ? e.message : "something went wrong"}`;
    }
  }
  if (act.kind === "contract") {
    if (!yes) return "Okay, the contract wasn't changed.";
    const q = act.payload as { paId: string; changes: { key: string; value: string }[]; lines: string[] };
    const u = await db.user.findUnique({ where: { id: user.id }, include: { role: true } });
    const c = u ? await loadContract(q.paId, u.role.permissions) : null;
    if (!u || !c) { await db.textAgentAction.update({ where: { id: act.id }, data: { status: "canceled" } }); return "Not saved: that contract was deleted."; }
    const next = { ...c.answers };
    for (const ch of q.changes) next[ch.key] = ch.value;
    try {
      const r = await saveContractAnswers({ id: u.id, permissions: u.role.permissions }, q.paId, next, " by text");
      await db.textAgentAction.update({ where: { id: act.id }, data: { payload: { ...q, before: c.answers, beforeStatus: (c.pa.dateStatus ?? {}) as object, beforeOrig: (c.pa.originalDates ?? {}) as object } } });
      return `✓ Saved ${c.pa.file.person.name}'s contract: ${q.lines.join("; ")}.${r.moved.length ? " Checklist dates and calendar invites moved with it." : ""}`;
    } catch (e) {
      await db.textAgentAction.update({ where: { id: act.id }, data: { status: "canceled" } });
      return `Not saved: ${e instanceof UserError ? e.message : "something went wrong. Change it on their page in HQ."}`;
    }
  }
  if (act.kind === "paperwork") {
    if (!yes) return "Okay, not sent.";
    const q = act.payload as { personId: string; toId: string; request: unknown };
    try {
      const r = await requestPaperwork(user, q.personId, q.toId, paperSchema.parse(q.request));
      await db.textAgentAction.update({ where: { id: act.id }, data: { payload: { ...q, taskId: r.taskId } as object } });
      return `✓ Sent to ${r.to}: a task due now with the steps${r.texted ? ", and a text" : ""}. You'll hear when it's ready to sign.`;
    } catch (e) {
      await db.textAgentAction.update({ where: { id: act.id }, data: { status: "canceled" } });
      return `Not sent: ${e instanceof UserError ? e.message : "something went wrong. Use Request paperwork on their deal in HQ."}`;
    }
  }
  if (!yes) return "Okay, not sent.";
  const p = act.payload as { personId: string; body: string; date: string | null; time: string | null };
  const person = await db.person.findFirst({ where: { id: p.personId, deletedAt: null }, include: { phones: { orderBy: { position: "asc" } } } });
  if (!person?.phones.length) return "Not sent: they have no phone number in HQ now.";
  // Texts the assistant sends go as a group text with the owner's own cell in it (owner request 2026-10-30).
  const theirs = [...new Set(person.phones.map((x) => x.normalized))];
  const me = await db.user.findUnique({ where: { id: user.id }, select: { forwardTo: true } });
  const cell = me?.forwardTo ? normalizePhone(me.forwardTo) : "";
  const withCell = cell && !theirs.includes(cell) && (await groupReady()) ? [...theirs, cell] : theirs;
  try {
    if (p.date && p.time) {
      const sendAt = centralToUtc(p.date, p.time);
      const s = await db.scheduledText.create({ data: { personId: person.id, numbers: withCell, body: p.body, sendAt, createdById: user.id } });
      await db.textAgentAction.update({ where: { id: act.id }, data: { payload: { ...p, scheduledId: s.id } } });
      await logActivity(user.id, "create", "scheduledText", person.id, `Scheduled a text to ${person.name} for ${scheduleLabel(sendAt)} by text`);
      return `✓ Scheduled for ${scheduleLabel(sendAt)} to ${person.name}${withCell !== theirs ? " + your cell" : ""}.`;
    }
    if (withCell.length > 1 && (await groupReady())) await textNumbersAsGroup(user, { numbers: withCell, body: p.body });
    else for (const n of theirs) await sendTextAs(user, { personId: person.id, to: n, body: p.body, typed: true });
    return withCell !== theirs ? `✓ Sent as a group text to ${person.name} + your cell.` : cell && !theirs.includes(cell) ? `✓ Sent to ${person.name} (just them: group texts are off in Admin → Integrations).` : `✓ Sent to ${person.name}.`;
  } catch (e) {
    await db.textAgentAction.update({ where: { id: act.id }, data: { status: "canceled" } });
    return `Not sent: ${e instanceof UserError ? e.message : "something went wrong. Send it from their page in HQ."}`;
  }
}

/** "undo": reverses the last thing the assistant did (in the last two hours). A text already sent can't be unsent. */
export async function undoLast(user: { id: string }): Promise<string> {
  const act = await db.textAgentAction.findFirst({ where: { userId: user.id, status: "done", createdAt: { gte: new Date(Date.now() - 2 * 3600000) } }, orderBy: { createdAt: "desc" } });
  if (!act) return "Nothing to undo from the last two hours.";
  const p = act.payload as Record<string, unknown>;
  const id = (k: string) => String(p[k] ?? "");
  let what = "";
  if (act.kind === "appt" || act.kind === "cancelAppt") {
    const appt = await db.appointment.update({ where: { id: id("appointmentId") }, data: { deletedAt: act.kind === "appt" ? new Date() : null } });
    const back = act.kind === "cancelAppt" && Array.isArray(p.removed) ? (p.removed as string[]) : [];
    if (appt.type === "buyer" || appt.type === "seller") await consultChanged(db, appt.personId, user.id, back);
    if (appt.type === "call") await callChanged(db, appt.personId, user.id, back);
    await syncAppointment(appt.id);
    what = act.kind === "appt" ? `Removed "${appt.title}".` : `Put "${appt.title}" back.`;
  } else if (act.kind === "moveAppt") {
    const b = p.before as { date: string; start: string | null; end: string | null };
    const appt = await db.appointment.update({ where: { id: id("appointmentId") }, data: { date: dateFromIso(b.date), start: b.start, end: b.end } });
    if (appt.type === "buyer" || appt.type === "seller") await redateConsult(db, appt.personId);
    if (appt.type === "call") await callChanged(db, appt.personId, user.id);
    await syncAppointment(appt.id);
    what = `Moved "${appt.title}" back to ${when(b.date, b.start)}.`;
  } else if (act.kind === "deleteContact") {
    const p = await db.person.update({ where: { id: id("personId") }, data: { deletedAt: null } });
    what = `Put ${p.name} back.`;
  } else if (act.kind === "merge") {
    return "Combining can't be undone by text. The other contact is in Trash (Admin → Trash) if you need its details.";
  } else if (act.kind === "whiteboard") {
    if (!(await removeBoardNote(user.id, id("noteId")))) return "That note is already off your whiteboard.";
    what = "Took that note off your whiteboard.";
  } else if (act.kind === "contract") {
    const before = p.before as Record<string, string> | undefined;
    if (!before) return "That contract change wasn't saved, so there's nothing to undo.";
    const u = await db.user.findUnique({ where: { id: user.id }, include: { role: true } });
    if (!u) return "Couldn't find you in HQ.";
    try { await saveContractAnswers({ id: u.id, permissions: u.role.permissions }, id("paId"), before, " (undo by text)"); } catch (e) { return `Couldn't undo: ${e instanceof UserError ? e.message : "change it back on their page in HQ."}`; }
    // The dates' Met / Extended marks go back too, so a moved-then-undone date isn't left "Extended".
    await db.purchaseAgreement.update({ where: { id: id("paId") }, data: { dateStatus: (p.beforeStatus ?? {}) as object, originalDates: (p.beforeOrig ?? {}) as object } });
    what = "Put the contract back the way it was.";
  } else if (act.kind === "event") {
    if (!(await removeCalendarEvent(id("eventId")))) return "Couldn't remove that calendar event. Delete it in Google Calendar.";
    what = "Removed it from your calendar.";
  } else if (act.kind === "contact") {
    const p = await db.person.update({ where: { id: id("personId") }, data: { deletedAt: new Date() } });
    what = `Removed ${p.name} (in Trash for 30 days).`;
  } else if (act.kind === "paperwork") {
    if (!p.taskId) return "That request wasn't sent, so there's nothing to undo.";
    await db.task.update({ where: { id: id("taskId") }, data: { deletedAt: new Date() } });
    what = "Took back that paperwork request (the task is in Trash). If they already got the text, let them know.";
  } else if (act.kind === "task") {
    await db.task.update({ where: { id: id("taskId") }, data: { deletedAt: new Date() } });
    what = "Removed that task.";
  } else if (act.kind === "note") {
    await db.timelineEntry.update({ where: { id: id("entryId") }, data: { deletedAt: new Date() } });
    what = "Removed that note.";
  } else if (act.kind === "text") {
    if (!p.scheduledId) return "That text already went out, so it can't be undone.";
    const r = await db.scheduledText.updateMany({ where: { id: id("scheduledId"), status: "pending" }, data: { status: "canceled" } });
    if (!r.count) return "That text already went out, so it can't be undone.";
    what = "Cancelled that scheduled text.";
  }
  await db.textAgentAction.update({ where: { id: act.id }, data: { status: "undone" } });
  await logActivity(user.id, "update", "textAgent", null, `Undid by text: ${act.summary.slice(0, 120)}`);
  return `↩ ${what}`;
}
