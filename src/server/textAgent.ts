import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/server/db";
import { UserError } from "@/server/safe";
import { isConnected } from "@/server/integrations";
import { logActivity } from "@/server/activity";
import { bookAppt } from "@/server/booking";
import { redateConsult } from "@/server/automation";
import { addCalendarEvent, calendarConnection, removeCalendarEvent, syncAppointment } from "@/server/google";
import { sendTextAs } from "@/server/texting";
import { groupReady, textNumbersAsGroup } from "@/server/groupText";
import { hasPermission } from "@/server/permissions";
import { calendarHint } from "@/lib/assistant";
import { addMinutes } from "@/lib/appointments";
import { dateFromIso, isoFromDate, todayCentral } from "@/lib/normalize";
import { centralToUtc, scheduleLabel, scheduleProblem } from "@/lib/scheduledText";
import { formatTime, longIso } from "@/lib/tasks";
import { clip, cleanWhen } from "@/lib/textAgent";

// The text assistant (owner request 2026-10-30): a team member texts their HQ number in plain English and Claude does it
// in HQ with these tools, then HQ texts back exactly what was done (written by HQ, not Claude, so it can't be wrong about
// it). Texting a client waits for a YES; "undo" reverses the last thing it did. What was texted is sent to Anthropic's
// API to read it; message bodies aren't logged.

const MODEL = "claude-opus-5-5";
const MAX_TURNS = 8;
const MEMORY_MIN = 30;

type Me = { id: string; name: string; email: string; permissions: string[] };

const SYSTEM = `You are the text assistant for the Petty Homes real estate team's CRM, called HQ. A team member texts you from their phone; you do what they ask with the tools, then reply by text.

People:
- Use find_people to get a contact's id. Never make up ids. Couples are stored together ("Sam & Lena Ortiz"), so search one first name or the last name.
- If a name matches several contacts, or none, don't guess: do nothing for it and ask which one (list the names briefly).
- Use person_details to answer questions about a contact (phone, email, deal, dates, tasks) and to get appointment ids.

Calendar:
- book_event puts something on the calendar. With a contact, it goes on their HQ page too ("Jack Rotman swing by house today 10:30am" → person_id Jack's id, title "Swing by house"). With no contact in it ("dentist Fri 3pm", "block Thursday afternoon for MLS tour"), person_id is "".
- If they name someone not in HQ, ask whether to put it on the calendar by itself or add them as a contact; don't do both.
- date YYYY-MM-DD from the calendar you're given; start/end 24-hour HH:MM. No end said: leave end "" (HQ uses an hour). No time said for a meeting: ask. "All day" or a reminder with no time: start "".
- invite_client true when it's a meeting with the client (they'll get the calendar invite); false for things you do on your own (dropping off a sign, a reminder). Only list team members in with_team when the speaker says someone joins.
- move_event / cancel_event change an appointment; get its id from person_details or my_schedule first.

Other:
- add_task for reminders and to-dos (due today if no day is said). add_note to log what happened with a client, in the speaker's words, cleaned up, keeping every fact.
- text_client when they want a client texted. Write the message as the speaker would (first person, casual, short). It is NOT sent until they reply YES, so call it once, then stop.
- my_schedule answers "what's on my calendar / today / tomorrow".
- You can't send emails, move deals between stages or change contracts yet; say so if asked.

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
      person_id: str('Contact id, or "" for an event that is not about a contact'), title: str("Short title, like \"Swing by house\" (no name needed when on a contact)"),
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
      const r = await bookAppt(me.id, { personId: p.id, type: "other", title, date: w.date, start: w.time, end, location: s("location").slice(0, 300),
        invitees: [...(a.invite_client === true ? p.emails.map((e) => e.address) : []), me.name, ...joining.map((u) => u.name)] });
      const invite = (await calendarConnection()) ? (a.invite_client === true && p.emails.length ? " Invite sent to them." : " On your calendar.") : "";
      await record(me.id, "appt", `✓ Booked "${title}" with ${p.name}, ${when(w.date, w.time, end)}.${invite}`, { appointmentId: r.id });
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
      if (appt.type === "buyer" || appt.type === "seller") await redateConsult(db, appt.personId);
      await syncAppointment(appt.id);
      await logActivity(me.id, "delete", "appointment", appt.id, `Deleted appointment "${appt.title}" by text`);
      await record(me.id, "cancelAppt", `✓ Cancelled "${appt.title}" with ${appt.person.name} (${when(before.date, before.start)}).`, { appointmentId: appt.id });
      return "Cancelled.";
    }
    const w = cleanWhen(a.date, a.start);
    if (!w) return "Not moved: give date YYYY-MM-DD.";
    const end = w.time ? (cleanWhen(a.date, a.end)?.time ?? (appt.start && appt.end ? addMinutes(w.time, minutesBetween(appt.start, appt.end)) : addMinutes(w.time, 60))) : null;
    await db.appointment.update({ where: { id: appt.id }, data: { date: dateFromIso(w.date), start: w.time, end } });
    if (appt.type === "buyer" || appt.type === "seller") await redateConsult(db, appt.personId);
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
    await record(me.id, "text", `Text ${p.name}${at}: "${body}"\nReply YES to send, or NO.`, { personId: p.id, body, date: later?.date ?? null, time: later?.time ?? null }, "confirm");
    return "Prepared. Waiting for them to reply YES. Stop here.";
  }
  return "Unknown tool.";
}

const minutesBetween = (a: string, b: string) => { const [h1, m1] = a.split(":").map(Number), [h2, m2] = b.split(":").map(Number); return Math.max(15, h2 * 60 + m2 - (h1 * 60 + m1)); };

/** A plain-English text from a team member's cell. Returns the reply to text back. */
export async function runTextAgent(user: { id: string; name: string }, text: string): Promise<string> {
  if (!isConnected("claude")) return 'HQ\'s assistant isn\'t connected yet (ANTHROPIC_API_KEY in Railway). You can still text "task …" or "contact …".';
  const u = await db.user.findUnique({ where: { id: user.id }, include: { role: true } });
  if (!u) return "Couldn't find you in HQ.";
  const me: Me = { id: u.id, name: u.name, email: u.email, permissions: u.role.permissions };
  const today = isoFromDate(todayCentral());
  const nowTime = new Date().toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" });
  const team = await db.user.findMany({ where: { status: { not: "DISABLED" } }, select: { name: true } });
  const memory = await db.textAgentTurn.findMany({ where: { userId: me.id, createdAt: { gte: new Date(Date.now() - MEMORY_MIN * 60000) } }, orderBy: { createdAt: "asc" }, take: 12 });
  await db.textAgentTurn.create({ data: { userId: me.id, role: "user", text: text.slice(0, 2000) } });

  const context = `${calendarHint(today)} It's ${nowTime} Central.\nSpeaker: ${me.name}. Team: ${team.map((t) => t.name).join(", ")}.`;
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...memory.map((m) => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), content: m.text })),
    { role: "user", content: `${context}\n\nText: ${text}` },
  ];
  // Claude needs turns to alternate; merge any two in a row from the same side.
  const merged = messages.reduce<Anthropic.Beta.BetaMessageParam[]>((out, m) => { const last = out[out.length - 1]; if (last && last.role === m.role && typeof last.content === "string" && typeof m.content === "string") last.content += `\n${m.content}`; else out.push({ ...m }); return out; }, []);
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
  if (!yes) return "Okay, not sent.";
  const p = act.payload as { personId: string; body: string; date: string | null; time: string | null };
  const person = await db.person.findFirst({ where: { id: p.personId, deletedAt: null }, include: { phones: { orderBy: { position: "asc" } } } });
  if (!person?.phones.length) return "Not sent: they have no phone number in HQ now.";
  const numbers = [...new Set(person.phones.map((x) => x.normalized))];
  try {
    if (p.date && p.time) {
      const sendAt = centralToUtc(p.date, p.time);
      const s = await db.scheduledText.create({ data: { personId: person.id, numbers, body: p.body, sendAt, createdById: user.id } });
      await db.textAgentAction.update({ where: { id: act.id }, data: { payload: { ...p, scheduledId: s.id } } });
      await logActivity(user.id, "create", "scheduledText", person.id, `Scheduled a text to ${person.name} for ${scheduleLabel(sendAt)} by text`);
      return `✓ Scheduled for ${scheduleLabel(sendAt)} to ${person.name}.`;
    }
    if (numbers.length > 1 && (await groupReady())) await textNumbersAsGroup(user, { numbers, body: p.body });
    else for (const n of numbers) await sendTextAs(user, { personId: person.id, to: n, body: p.body, typed: true });
    return `✓ Sent to ${person.name}.`;
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
    if (appt.type === "buyer" || appt.type === "seller") await redateConsult(db, appt.personId);
    await syncAppointment(appt.id);
    what = act.kind === "appt" ? `Removed "${appt.title}".` : `Put "${appt.title}" back.`;
  } else if (act.kind === "moveAppt") {
    const b = p.before as { date: string; start: string | null; end: string | null };
    const appt = await db.appointment.update({ where: { id: id("appointmentId") }, data: { date: dateFromIso(b.date), start: b.start, end: b.end } });
    if (appt.type === "buyer" || appt.type === "seller") await redateConsult(db, appt.personId);
    await syncAppointment(appt.id);
    what = `Moved "${appt.title}" back to ${when(b.date, b.start)}.`;
  } else if (act.kind === "event") {
    if (!(await removeCalendarEvent(id("eventId")))) return "Couldn't remove that calendar event. Delete it in Google Calendar.";
    what = "Removed it from your calendar.";
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
