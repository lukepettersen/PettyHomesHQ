// Events (owner request 2026-11-21; SPEC.md §6.7): templates, slots, attendees, signup answers, reminder timing and
// merge fields, the Timberwolves schedule and CSV import. Pure, tested in events.test.ts.
import { centralToUtc } from "@/lib/scheduledText";
import { parseCsv } from "@/lib/addressList";
import { formatTime } from "@/lib/tasks";

export type FieldType = "text" | "long" | "number" | "select";
export type EventField = { key: string; label: string; type: FieldType; options: string[]; required: boolean };
export type TemplateReminder = { name: string; body: string; daysBefore: number; time: string };
export type Answers = Record<string, string>;

export const STATUS_KEYS = ["invited", "confirmed", "sent", "declined"] as const;
export type AttendeeStatus = (typeof STATUS_KEYS)[number];
export const statusLabel = (s: string, doneLabel = "Tickets sent") =>
  s === "invited" ? "Invited" : s === "confirmed" ? "Confirmed" : s === "sent" ? doneLabel || "Sent" : s === "declined" ? "Declined" : s;
/** Who reminders go to unless a reminder says otherwise: people who are coming. */
export const DEFAULT_REMINDER_STATUSES: AttendeeStatus[] = ["confirmed", "sent"];

/** "Pie flavor" → "pie_flavor": the merge field and the answer's key. */
export const fieldKey = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "answer";

/** Names already used by contact and event merge fields: a question can't take one. */
const RESERVED = new Set(["first_name", "last_name", "full_name", "mailing_name", "legal_names", "primary_first_name", "partner_first_name", "phone", "email", "street", "city",
  "event_name", "event_date", "event_short_date", "event_time", "opponent", "location", "seat_info", "slot_title"]);

export function cleanFields(v: unknown): EventField[] {
  const out: EventField[] = [];
  for (const raw of Array.isArray(v) ? v : []) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const label = String(r.label ?? "").trim().slice(0, 80);
    if (!label) continue;
    const type: FieldType = ["text", "long", "number", "select"].includes(String(r.type)) ? (r.type as FieldType) : "text";
    let key = fieldKey(typeof r.key === "string" && r.key ? r.key : label);
    if (RESERVED.has(key)) key = `${key}_answer`;
    while (out.some((f) => f.key === key)) key = `${key}_2`;
    const options = type === "select" ? [...new Set((Array.isArray(r.options) ? r.options : String(r.options ?? "").split(/\n|,/)).map((o) => String(o).trim()).filter(Boolean))].slice(0, 30) : [];
    out.push({ key, label, type, options, required: r.required === true });
  }
  return out.slice(0, 20);
}

export function cleanTemplateReminders(v: unknown): TemplateReminder[] {
  return (Array.isArray(v) ? v : []).flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const r = raw as Record<string, unknown>;
    const body = String(r.body ?? "").trim().slice(0, 1000);
    if (!body) return [];
    return [{ name: String(r.name ?? "").trim().slice(0, 80) || "Reminder", body, daysBefore: clampDays(r.daysBefore), time: cleanTime(r.time) }];
  }).slice(0, 10);
}

export const clampDays = (v: unknown) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(60, Math.max(0, n)) : 1; };
/** A reminder time on the half hour between 8am and 8pm (texting's quiet hours), else 10am. */
export function cleanTime(v: unknown): string {
  const m = String(v ?? "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "10:00";
  const h = Number(m[1]), mi = Number(m[2]);
  if (h < 8 || h > 20 || (h === 20 && mi > 0) || ![0, 30].includes(mi)) return "10:00";
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

/** Answers kept to the event's questions: numbers are numbers, choices are one of the options. */
export function cleanAnswers(fields: EventField[], raw: unknown): Answers {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Answers = {};
  for (const f of fields) {
    let v = String(src[f.key] ?? "").trim().slice(0, f.type === "long" ? 1000 : 200);
    if (f.type === "number" && v) v = /^\d{1,4}$/.test(v) ? String(Number(v)) : "";
    if (f.type === "select" && v) v = f.options.find((o) => o.toLowerCase() === v.toLowerCase()) ?? "";
    if (v) out[f.key] = v;
  }
  return out;
}

/** The first required question left blank, as a sentence for the signup page. */
export function answersProblem(fields: EventField[], answers: Answers): string | null {
  const miss = fields.find((f) => f.required && !answers[f.key]);
  return miss ? `Please fill in "${miss.label}".` : null;
}

/** Short answers for a contact's Events list ("2 Apple"): numbers, then choices. Typed answers (an address) only when
 *  there's nothing else to show. */
export function answerSummary(fields: EventField[], answers: Answers): string {
  const shown = fields.filter((f) => answers[f.key]);
  const picks = [...shown.filter((f) => f.type === "number"), ...shown.filter((f) => f.type === "select")];
  return (picks.length ? picks : shown.filter((f) => f.type === "text").slice(0, 1)).map((f) => answers[f.key]).join(" ");
}

const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const parts = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }; };
/** "Thursday, January 14" */
export const longEventDate = (iso: string) => { const p = parts(iso); return `${DOW[p.dow]}, ${MON[p.m - 1]} ${p.d}`; };
/** "1/14/27" */
export const shortEventDate = (iso: string) => { const p = parts(iso); return `${p.m}/${p.d}/${String(p.y).slice(2)}`; };

export type SlotInfo = { date: string; time: string | null; title: string; opponent: string; location: string; details: string };
/** What a slot is called: its own title, else the event's name. */
export const slotName = (s: Pick<SlotInfo, "title">, eventName: string) => s.title.trim() || eventName;
/** "Wolves vs Lakers 1/14/27": how a slot shows on a contact's page. */
export const slotLine = (s: Pick<SlotInfo, "title" | "date">, eventName: string) => `${slotName(s, eventName)} ${shortEventDate(s.date)}`;

export const EVENT_MERGE_FIELDS: [string, string][] = [
  ["event_name", "Event name"], ["event_date", "Date (Thursday, January 14)"], ["event_short_date", "Date (1/14/27)"], ["event_time", "Time (7:00pm)"],
  ["opponent", "Opponent"], ["location", "Location"], ["seat_info", "Seats / ticket info"], ["slot_title", "Game or date title"],
];

/** The event's merge values for one attendee: event, slot, and their signup answers. */
export function eventMergeValues(e: { name: string; location: string }, s: SlotInfo, answers: Answers): Record<string, string> {
  return {
    event_name: e.name, event_date: longEventDate(s.date), event_short_date: shortEventDate(s.date), event_time: s.time ? formatTime(s.time) : "",
    opponent: s.opponent, location: s.location || e.location, seat_info: s.details, slot_title: slotName(s, e.name), ...answers,
  };
}

const addDays = (iso: string, n: number) => { const p = parts(iso); return new Date(Date.UTC(p.y, p.m - 1, p.d + n)).toISOString().slice(0, 10); };
/** When a reminder goes out for a slot: `daysBefore` days before its date, at `time` Central. */
export const reminderSendAt = (slotDate: string, daysBefore: number, time: string) => centralToUtc(addDays(slotDate, -daysBefore), time);
/** "1 day before at 10:00am", "Day of at 9:00am" */
export const reminderWhen = (daysBefore: number, time: string) => `${daysBefore === 0 ? "Day of" : `${daysBefore} ${daysBefore === 1 ? "day" : "days"} before`} at ${formatTime(time)}`;

/** Whether the signup page takes answers right now, and why not. */
export function signupState(e: { signupOn: boolean; signupOpensAt: Date | null; signupClosesAt: Date | null }, now = new Date()): { open: boolean; why: string } {
  if (!e.signupOn) return { open: false, why: "Signups for this event are closed." };
  if (e.signupOpensAt && now < e.signupOpensAt) return { open: false, why: "Signups for this event aren't open yet." };
  if (e.signupClosesAt && now > e.signupClosesAt) return { open: false, why: "Signups for this event have closed." };
  return { open: true, why: "" };
}

// ---------- Timberwolves home schedule ----------

export const NBA_SCHEDULE_URL = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json";
/** Where the schedule is read from (NBA_SCHEDULE_URL points local tests at a fake copy), with browser-like headers. */
export const nbaScheduleUrl = () => (typeof process !== "undefined" && process.env.NBA_SCHEDULE_URL) || NBA_SCHEDULE_URL;
export const NBA_HEADERS = { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; PettyHomesHQ/1.0)", Referer: "https://www.nba.com/" };
export type ImportedSlot = { externalId: string | null; date: string; time: string | null; title: string; opponent: string; location: string; details: string };

/** A UTC time as the Central date and "HH:MM". */
export function centralParts(utc: Date): { date: string; time: string } {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(utc);
  const g = (t: string) => f.find((x) => x.type === t)?.value ?? "";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}:${g("minute")}` };
}

/**
 * The NBA's league schedule (scheduleLeagueV2.json) → one team's regular-season home games. Preseason ("001"),
 * All-Star and playoff games are left out; NBA Cup group games are regular season and stay in.
 */
export function parseNbaSchedule(json: unknown, team = "MIN", season?: string): { season: string; slots: ImportedSlot[] } {
  const ls = (json as { leagueSchedule?: { seasonYear?: string; gameDates?: { games?: unknown[] }[] } })?.leagueSchedule;
  if (!ls || !Array.isArray(ls.gameDates)) throw new Error("That doesn't look like the NBA schedule.");
  const seasonYear = String(ls.seasonYear ?? "");
  if (season && seasonYear && seasonYear !== season) throw new Error(`The NBA's schedule is for ${seasonYear}, not ${season} yet.`);
  const slots: ImportedSlot[] = [];
  for (const day of ls.gameDates) for (const raw of day.games ?? []) {
    const g = raw as { gameId?: string; gameDateTimeUTC?: string; gameDateUTC?: string; homeTeam?: { teamTricode?: string }; awayTeam?: { teamCity?: string; teamName?: string; teamTricode?: string }; arenaName?: string; arenaCity?: string; arenaState?: string };
    if (g.homeTeam?.teamTricode !== team || !String(g.gameId ?? "").startsWith("002")) continue;
    const when = g.gameDateTimeUTC ? new Date(g.gameDateTimeUTC) : null;
    if (!when || Number.isNaN(when.getTime())) continue;
    const { date, time } = centralParts(when);
    // A game with no set time yet comes as midnight Eastern / 11pm Central the day before; keep the date, no time.
    const tbd = time === "23:00" || time === "00:00";
    const away = [g.awayTeam?.teamCity, g.awayTeam?.teamName].filter(Boolean).join(" ").trim() || g.awayTeam?.teamTricode || "TBD";
    slots.push({ externalId: g.gameId!, date: tbd && time === "23:00" ? addDays(date, 1) : date, time: tbd ? null : time, title: `Wolves vs ${g.awayTeam?.teamName ?? away}`, opponent: away,
      location: [g.arenaName, g.arenaCity].filter(Boolean).join(", ") || "Target Center, Minneapolis", details: "" });
  }
  slots.sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
  return { season: seasonYear, slots };
}

// ---------- CSV import of dates ----------

const MONTHS_SHORT = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** "2027-01-14", "1/14/2027", "1/14/27", "Jan 14, 2027", "Thu, Jan 14 2027" → "2027-01-14". */
export function readDate(v: string): string | null {
  const t = v.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1], +m[2]);
  m = t.match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && MONTHS_SHORT.includes(m[1].toLowerCase())) return iso(+m[3], MONTHS_SHORT.indexOf(m[1].toLowerCase()) + 1, +m[2]);
  return null;
}
const iso = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y > 2000 && y < 2100 ? dt.toISOString().slice(0, 10) : null;
};
/** "7:00 PM", "7pm", "19:00" → "19:00"; blank or "TBD" → null. */
export function readTime(v: string): string | null {
  const m = v.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?\b/);
  if (!m) return null;
  let h = +m[1];
  const mi = +(m[2] ?? 0), ap = m[3]?.[0];
  if (ap === "p" && h < 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  return h < 24 && mi < 60 ? `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}` : null;
}

/** A spreadsheet of dates (Date, Time, Opponent, Location, Seats / Details, Title): one slot per row. */
/** `team` ("Wolves") starts a made-up title: "Wolves vs Lakers". */
export function readSlotCsv(text: string, team = ""): { slots: ImportedSlot[]; problem: string | null; skipped: number } {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim()));
  if (rows.length < 2) return { slots: [], problem: "The file needs a heading row and at least one date.", skipped: 0 };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h === n || h.includes(n)));
  const c = { date: col("date"), time: col("time", "start"), opp: col("opponent", "vs", "away"), loc: col("location", "arena", "venue"), det: col("seat", "ticket", "detail", "notes"), title: col("title", "name", "game") };
  if (c.date < 0) return { slots: [], problem: 'The file needs a "Date" column.', skipped: 0 };
  let skipped = 0;
  const slots = rows.slice(1).flatMap((r) => {
    const get = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    const date = readDate(get(c.date));
    if (!date) { skipped++; return []; }
    const opponent = get(c.opp).replace(/^(vs\.?|@)\s*/i, "");
    return [{ externalId: null, date, time: readTime(get(c.time)), title: get(c.title) || (opponent ? `${team ? `${team} ` : ""}vs ${opponent.split(/\s+/).slice(-1)[0]}` : ""), opponent, location: get(c.loc), details: get(c.det) }];
  });
  return { slots, problem: slots.length ? null : "No dates in that file could be read (use 2027-01-14 or 1/14/2027).", skipped };
}
