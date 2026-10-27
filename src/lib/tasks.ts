// Task rules from SPEC.md §9, kept pure so they can be unit tested (tasks.test.ts).
// Dates are ISO "YYYY-MM-DD" strings for Central-time calendar days.
import { splitCouple } from "@/lib/normalize";

export type Repeat = "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "YEARLY";
export const REPEATS: [Repeat, string][] = [["DAILY", "Daily"], ["WEEKLY", "Weekly"], ["BIWEEKLY", "Every other week"], ["MONTHLY", "Monthly"], ["YEARLY", "Yearly"]];
export const repeatLabel = (r: string | null | undefined) => REPEATS.find(([k]) => k === r)?.[1] ?? "";

export const PRIORITIES = ["None", "Low", "Medium", "High"];

/** Types offered in the Create task pop-up (SPEC.md §6.3). */
export const TASK_KINDS: [string, string][] = [["followup", "Follow up"], ["call", "Call"], ["text", "Text"], ["email", "Email"], ["showing", "Showing"], ["closing", "Closing"], ["other", "Other"]];

export type BuiltinList = "clients" | "touch" | "dates" | "recurring" | "misc";

/** Every task lands in exactly one list: Important dates → Recurring → its own list → Clients → Misc. */
export function categoryOf(t: { sourceKey?: string | null; repeat?: string | null; listId?: string | null; personId?: string | null }): string {
  if (t.sourceKey?.startsWith("date:")) return "dates";
  if (t.repeat) return "recurring";
  if (t.listId) return `list:${t.listId}`;
  if (t.personId) return "clients";
  return "misc";
}

// ---------- Dates ----------
const DAY = 86400000;
const toMs = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => fromMs(toMs(iso) + n * DAY);
/** Whole days from b to a (positive when a is later). */
export const diffDays = (a: string, b: string) => Math.round((toMs(a) - toMs(b)) / DAY);

function addMonths(iso: string, n: number): string {
  const y = +iso.slice(0, 4), m = +iso.slice(5, 7) - 1 + n, d = +iso.slice(8, 10);
  const ny = y + Math.floor(m / 12), nm = ((m % 12) + 12) % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return fromMs(Date.UTC(ny, nm, Math.min(d, last)));
}

/** The next due date after completing a repeating task. */
export function nextDue(iso: string, repeat: Repeat): string {
  switch (repeat) {
    case "DAILY": return addDays(iso, 1);
    case "WEEKLY": return addDays(iso, 7);
    case "BIWEEKLY": return addDays(iso, 14);
    case "MONTHLY": return addMonths(iso, 1);
    case "YEARLY": return addMonths(iso, 12);
  }
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const shortIso = (iso: string) => `${MON[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}`;
export const longIso = (iso: string) => `${DOW[new Date(toMs(iso)).getUTCDay()]} ${shortIso(iso)}`;

/** "14:00" → "2:00pm" */
export function formatTime(t: string | null | undefined): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}

/** Accepts "9", "9am", "9:30 pm", "14:00" → "HH:MM" (24h) or null. */
export function parseTime(raw: string): string | null {
  const m = raw.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!m) return null;
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  if (min > 59) return null;
  if (m[3]) { if (h < 1 || h > 12) return null; h = (h % 12) + (m[3].startsWith("p") ? 12 : 0); }
  if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** "Today", "Tomorrow", "Oct 9" when overdue, otherwise "Fri Oct 17"; plus the time. */
export function dueLabel(due: string | null, time: string | null | undefined, today: string): string {
  if (!due) return "No date";
  const n = diffDays(due, today);
  const day = n === 0 ? "Today" : n === 1 ? "Tomorrow" : n < 0 ? shortIso(due) : longIso(due);
  return time ? `${day} ${formatTime(time)}` : day;
}

// ---------- Quick add ----------
export type QuickAdd = {
  title: string;
  due?: string;
  time?: string;
  repeat?: Repeat;
  priority?: number;
  list?: string; // name typed after #
  assignee?: string; // first name typed after @ ("me" for yourself)
  personWord?: string; // word after "re" / "for" / "with"; matched to a person on the server
};

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * Natural-language quick add: "call lender re Ortiz Fri 9am", "rent check every month",
 * "#list", "!high", "@alyssa", today / tomorrow / a weekday / next week.
 */
export function parseQuickAdd(text: string, today: string): QuickAdd {
  let s = ` ${text} `;
  const out: QuickAdd = { title: "" };
  const take = (re: RegExp) => { const m = s.match(re); if (m) s = s.replace(m[0], " "); return m; };
  let m: RegExpMatchArray | null;

  if (take(/\s(every\s+(other|2|two)\s+weeks?|bi-?weekly)(?=\s)/i)) out.repeat = "BIWEEKLY";
  else if ((m = take(/\s(every\s+(day|week|month|year)|daily|weekly|monthly|yearly)(?=\s)/i))) {
    const w = (m[2] ?? m[1]).toLowerCase();
    out.repeat = w.startsWith("da") ? "DAILY" : w.startsWith("w") ? "WEEKLY" : w.startsWith("m") ? "MONTHLY" : "YEARLY";
  }
  if ((m = take(/\s(\d{1,2}(?::\d{2})?\s*(?:am|pm))(?=\s)/i))) out.time = parseTime(m[1]) ?? undefined;
  if (take(/\s(today|tonight)(?=\s)/i)) out.due = today;
  else if (take(/\s(tomorrow|tmrw)(?=\s)/i)) out.due = addDays(today, 1);
  else if (take(/\snext week(?=\s)/i)) out.due = addDays(today, 7);
  else if ((m = take(/\s(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday|sday)?(?=\s)/i))) {
    const k = WEEKDAYS.indexOf(m[1].toLowerCase().slice(0, 3));
    let n = (k - new Date(toMs(today)).getUTCDay() + 7) % 7;
    if (n === 0) n = 7;
    out.due = addDays(today, n);
  }
  if ((m = take(/\s!(high|h|3|medium|med|m|2|low|l|1)(?=\s)/i))) {
    const p = m[1].toLowerCase();
    out.priority = p.startsWith("h") || p === "3" ? 3 : p.startsWith("m") || p === "2" ? 2 : 1;
  }
  if ((m = take(/\s#([\w-]+)(?=\s)/))) out.list = m[1].replace(/[-_]+/g, " ");
  if ((m = take(/\s@([a-z]+)(?=\s)/i))) out.assignee = m[1].toLowerCase();
  if ((m = s.match(/\s(?:re|for|with)\s+([a-z][a-z'-]*)(?=\s)/i))) out.personWord = m[1];
  out.title = s.replace(/\s+/g, " ").trim();
  return out;
}

/** Removes the "re Ortiz" part once it has been matched to a person. */
export function stripPersonWord(title: string, word: string): string {
  return title.replace(new RegExp(`\\s*\\b(?:re|for|with)\\s+${word.replace(/[^a-z'-]/gi, "")}\\b`, "i"), "").replace(/\s+/g, " ").trim() || title;
}

// ---------- Important dates (SPEC.md §9) ----------
export type DateInput = { id: string; kind: string; whose: string; date: string; personId: string; personName: string; stage: string | null; assignedToId: string | null };
export type ReminderInput = { id: string; dateKind: string; title: string; days: number; direction: string; assignee: string; kind: string; appliesTo: string };
export type DateTask = { key: string; title: string; due: string; personId: string; personName: string; assigneeId: string | null; kind: string };

/** Birthdays and homeiversaries run through Admin → Date reminders, from 14 days back to 60 days ahead. */
const SMALL = new Set(["a", "an", "and", "the", "to", "of", "on", "for", "in", "at"]);
/** "send birthday card" → "Send Birthday Card" (small words like "to" stay lowercase mid-title). */
export const titleCase = (s: string) => s.trim().split(/\s+/).map((w, i) => (i > 0 && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");

export function importantDateTasks(dates: DateInput[], reminders: ReminderInput[], team: { id: string; name: string }[], today: string): DateTask[] {
  const out: DateTask[] = [];
  const year = +today.slice(0, 4);
  for (const d of dates) {
    const who = d.whose.trim() || splitCouple(d.personName)[0].trim().split(/\s+/)[0];
    for (const r of reminders) {
      if (r.dateKind !== d.kind) continue;
      if (r.appliesTo !== "Everyone" && r.appliesTo.toLowerCase() !== (d.stage ?? "").toLowerCase()) continue;
      for (const y of [year - 1, year, year + 1]) {
        // The date itself isn't an anniversary: a homeiversary set from this year's closing first comes up next year.
        if (y <= +d.date.slice(0, 4)) continue;
        const occ = `${y}${d.date.slice(4)}`;
        const due = addDays(occ, r.direction === "before" ? -r.days : r.direction === "after" ? r.days : 0);
        const n = diffDays(due, today);
        if (n < -14 || n > 60) continue;
        const member = r.assignee ? team.find((t) => t.name.split(/\s+/)[0].toLowerCase() === r.assignee.toLowerCase()) : undefined;
        out.push({
          key: `date:${d.id}:${r.id}:${y}`,
          // Owner (2026-10-14): birthdays name whose it is; homeiversaries are just the action ("Send Homeiversary Card").
          title: d.kind === "birthday" ? `${titleCase(r.title)} · ${who}` : titleCase(r.title),
          due, personId: d.personId, personName: d.personName,
          assigneeId: member?.id ?? d.assignedToId, kind: r.kind,
        });
      }
    }
  }
  return out;
}

/**
 * Who a birthday card goes to: just the birthday person, with their last name (owner request 2026-10-27).
 * "Sam & Lena Ortiz" + "Lena" → "Lena Ortiz"; "Sam Ortiz & Lena Brooks" + "Lena" → "Lena Brooks"; a child "Mia" → "Mia Ortiz".
 */
export function birthdayName(personName: string, whose: string): string {
  const parts = splitCouple(personName).map((p) => p.trim().split(/\s+/)).filter((p) => p[0]);
  const w = whose.trim();
  const last = parts.find((p) => p.length > 1)?.at(-1) ?? "";
  const mine = w ? parts.find((p) => p[0].toLowerCase() === w.toLowerCase()) : parts[0];
  if (mine) return mine.length > 1 ? mine.join(" ") : [mine[0], last].filter(Boolean).join(" ");
  return [w, last].filter(Boolean).join(" ");
}

export type Subtask = { title: string; done: boolean };
export function parseSubtasks(v: unknown): Subtask[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Subtask => !!x && typeof x === "object" && typeof (x as Subtask).title === "string").map((x) => ({ title: x.title, done: !!x.done }));
}

/** Cookie remembering the Tasks page Everyone / Me / teammate filter on this device. */
export const WHO_COOKIE = "hq-tasks-who";
/** The last Tasks view (Today, Upcoming, a list) on this device, so the home-screen icon reopens it (owner request 2026-10-27). */
export const VIEW_COOKIE = "hq-tasks-view";

// ---------- Due for a touch: weekdays only (owner 2026-10-24) ----------
const DAY_MS = 86400000;
/** Saturday or Sunday (a date at midnight UTC, as todayCentral returns). */
export const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;
/** The next `n` weekdays starting with `from` (if it's a weekday) — the days Spread out puts people on. */
export function workdays(from: Date, n: number): Date[] {
  const out: Date[] = [];
  for (let d = new Date(from); out.length < n; d = new Date(d.getTime() + DAY_MS)) if (!isWeekend(d)) out.push(d);
  return out;
}

/**
 * Deal checklist order (owner request 2026-10-26): sections by their soonest open step, finished sections last;
 * inside a section, open steps soonest first, then done ones. Steps waiting for a date go after dated ones.
 */
export function checklistOrder<T extends { done: boolean; due: string | null; phase: string }>(tasks: T[]): { phase: string; items: T[] }[] {
  const byDue = (a: T, b: T) => (a.due ?? "9999") < (b.due ?? "9999") ? -1 : (a.due ?? "9999") > (b.due ?? "9999") ? 1 : 0;
  const phases = [...new Set(tasks.map((t) => t.phase))].map((phase, i) => {
    const all = tasks.filter((t) => t.phase === phase);
    const open = all.filter((t) => !t.done).sort(byDue);
    return { phase, i, next: open.length ? open[0].due ?? "9999" : null, items: [...open, ...all.filter((t) => t.done)] };
  });
  return phases.sort((a, b) => (a.next === null) !== (b.next === null) ? (a.next === null ? 1 : -1) : a.next !== b.next ? (a.next! < b.next! ? -1 : 1) : a.i - b.i)
    .map(({ phase, items }) => ({ phase, items }));
}
