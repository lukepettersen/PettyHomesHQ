// The weekly contingency deadlines email (owner request 2026-11-04), like the one the assistant used to write by hand:
// This Week / Next Week, then Buyers / Sellers, each "SHARPE/NGUYEN | Monday, 11/03", the address and the deadline.
// Pure, tested in deadlineDigest.test.ts.
import { nameParts } from "./merge";
import type { DateKey, DateStatus } from "./pa";

/** The contract dates that are contingencies (closing and Final Acceptance aren't). */
export const CONTINGENCIES: [DateKey, string][] = [["inspection", "Inspection Deadline"], ["writtenStatement", "Written Statement Deadline"], ["hoaRescission", "HOA Doc Rescission Deadline"]];

export type DigestPa = { side: "buyer" | "seller"; personName: string; address: string; dates: Partial<Record<DateKey, string | null>>; dateStatus: Partial<Record<DateKey, DateStatus>>; writtenStatementNA: boolean; hoa: boolean };
export type DigestRow = { side: "buyer" | "seller"; names: string; date: string; address: string; what: string };
export type DigestSettings = { on: boolean; day: number; time: string; from: string; to: string[] };
export const DEFAULT_DIGEST: DigestSettings = { on: false, day: 1, time: "08:00", from: "", to: [] };

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
/** Monday of the week a day is in. */
export function weekStart(iso: string): string {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return addDays(iso, -((dow + 6) % 7));
}

/** Open contingency deadlines in this week (Monday–Sunday of `today`) and next week, soonest first. Met and waived ones are left out. */
export function digestRows(pas: DigestPa[], today: string): { thisWeek: DigestRow[]; nextWeek: DigestRow[] } {
  const mon = weekStart(today), nextMon = addDays(mon, 7), after = addDays(mon, 14);
  const rows: DigestRow[] = [];
  for (const pa of pas) for (const [k, what] of CONTINGENCIES) {
    if (k === "writtenStatement" && pa.writtenStatementNA) continue;
    if (k === "hoaRescission" && !pa.hoa) continue;
    const d = pa.dates[k];
    const st = pa.dateStatus[k] ?? "pending";
    if (!d || st === "met" || st === "waived" || d < mon || d >= after) continue;
    rows.push({ side: pa.side, names: nameParts(pa.personName).last.toUpperCase() || pa.personName.toUpperCase(), date: d, address: pa.address, what });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.names.localeCompare(b.names));
  return { thisWeek: rows.filter((r) => r.date < nextMon), nextWeek: rows.filter((r) => r.date >= nextMon) };
}

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const day = (iso: string) => `${DOW[new Date(`${iso}T12:00:00Z`).getUTCDay()]}, ${iso.slice(5, 7)}/${iso.slice(8, 10)}`;
const mapLink = (a: string) => `[${a}](https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)})`;

/** The email: subject and body (HQ's email formatting: **bold**, [links](…)). */
export function digestEmail(rows: { thisWeek: DigestRow[]; nextWeek: DigestRow[] }, toFirst: string, today: string): { subject: string; body: string } {
  const part = (list: DigestRow[], side: "buyer" | "seller") => {
    const mine = list.filter((r) => r.side === side);
    return `**${side === "buyer" ? "BUYERS" : "SELLERS"}**\n\n${mine.length ? mine.map((r) => `${r.names} | ${day(r.date)}\n${mapLink(r.address)}\n${r.what}`).join("\n\n") : "**NONE**"}`;
  };
  const week = (title: string, list: DigestRow[]) => `**${title}**\n\n${part(list, "buyer")}\n\n${part(list, "seller")}`;
  return {
    subject: `Weekly Contingency Report - Week of ${weekOf(today)}`,
    body: `Hi ${toFirst || "there"}! Here's your weekly update on upcoming contingency deadlines:\n\n${week("This Week", rows.thisWeek)}\n\n${week("Next Week", rows.nextWeek)}`,
  };
}

/** Saved settings, cleaned. */
export function cleanDigest(raw: unknown): DigestSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const day = Number(o.day);
  return {
    on: o.on === true, day: Number.isInteger(day) && day >= 0 && day <= 6 ? day : 1,
    time: typeof o.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(o.time) ? o.time : "08:00",
    from: typeof o.from === "string" ? o.from.slice(0, 40) : "",
    to: Array.isArray(o.to) ? o.to.filter((x): x is string => typeof x === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)).slice(0, 10) : [],
  };
}

// ---------- More weekly reports (owner request 2026-11-04): closings and listings, like the assistant's emails ----------

export type ReportKind = "deadlines" | "closings" | "listings";
export const REPORTS: { kind: ReportKind; name: string; blurb: string }[] = [
  { kind: "deadlines", name: "Contingency deadlines", blurb: "Inspection, Written Statement and HOA rescission deadlines still open on active contracts, this week and next." },
  { kind: "closings", name: "Closings", blurb: "Closings this week (and ones that already closed), next week and further out, buyers and sellers." },
  { kind: "listings", name: "Listings", blurb: "Your listings by stage: Active / Coming Soon, Upcoming, and Withheld / No Timeline." },
];

const longDay = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`); return `${DOW[d.getUTCDay()]}, ${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][d.getUTCMonth()]} ${d.getUTCDate()}`; };
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
const weekOf = (today: string) => { const m = weekStart(today), d = new Date(`${m}T12:00:00Z`); return `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][d.getUTCMonth()]} ${ordinal(d.getUTCDate())}`; };
const lastNames = (name: string) => nameParts(name).last || name;

export type ClosingPa = { side: "buyer" | "seller"; personName: string; address: string; closing: string | null; closedOn: string | null };
/** Closings email: this week (incl. ones already closed this week), next week, further out (and active ones with no closing date). */
export function closingsEmail(pas: ClosingPa[], toFirst: string, today: string): { subject: string; body: string } {
  const mon = weekStart(today), nextMon = addDays(mon, 7), after = addDays(mon, 14);
  const rows = pas.flatMap((p) => {
    const closed = !!p.closedOn, date = p.closedOn ?? p.closing;
    if (closed && (date! < mon || date! >= nextMon)) return []; // only this week's closed ones
    return [{ ...p, date, closed, names: lastNames(p.personName) }];
  }).sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.names.localeCompare(b.names));
  const line = (r: (typeof rows)[number]) => `${r.closed ? "**CLOSED**" : r.side === "buyer" ? "BUYER" : "SELLER"} | ${r.date ? day(r.date).replace(",", "") : "No closing date"} | ${r.names}\n${mapLink(r.address)}`;
  const part = (list: typeof rows, side: "buyer" | "seller") => { const mine = list.filter((r) => r.side === side); return `**${side === "buyer" ? "BUYERS" : "SELLERS"}**\n\n${mine.length ? mine.map(line).join("\n\n") : "**NONE**"}`; };
  const week = (title: string, list: typeof rows) => `**${title}**\n\n${part(list, "buyer")}\n\n${part(list, "seller")}`;
  return {
    subject: `Weekly Closing Report - Week of ${weekOf(today)}`,
    body: `Hi ${toFirst || "there"}! Here's your weekly update on upcoming closings:\n\n${week("This Week", rows.filter((r) => r.date && r.date < nextMon))}\n\n${week("Next Week", rows.filter((r) => r.date && r.date >= nextMon && r.date < after))}\n\n${week("Further Out", rows.filter((r) => !r.date || r.date >= after))}`,
  };
}

export type ListingFile = { personName: string; address: string | null; status: string; active: string | null; photos: string | null };
/** Which part of the listings email a listing stage goes in; null = left out (consults: not a listing yet). */
export function listingGroup(status: string): "live" | "upcoming" | "held" | null {
  if (/consult/i.test(status)) return null;
  if (/withh?eld|hold|pause|no timeline/i.test(status)) return "held";
  if (/active|coming soon/i.test(status)) return "live";
  return "upcoming";
}
/** Listings email: Active / Coming Soon, Upcoming, Withheld / No Timeline (listings under contract are in the closings email). */
export function listingsEmail(files: ListingFile[], toFirst: string, today: string): { subject: string; body: string } {
  const item = (f: ListingFile) => {
    const notes = [/coming soon/i.test(f.status) ? `Coming Soon${f.active ? ` - goes active ${longDay(f.active)}` : ""}` : "",
      listingGroup(f.status) === "upcoming" ? [f.status, f.photos ? `photos ${longDay(f.photos)}` : "", f.active ? `active ${longDay(f.active)}` : ""].filter(Boolean).join(" · ") : ""].filter(Boolean);
    return `**${lastNames(f.personName).toUpperCase()}**\n${f.address ? mapLink(f.address) : "No address yet"}${notes.length ? `\n${notes.join("\n")}` : ""}`;
  };
  const part = (title: string, g: "live" | "upcoming" | "held") => { const mine = files.filter((f) => listingGroup(f.status) === g).sort((a, b) => lastNames(a.personName).localeCompare(lastNames(b.personName))); return `**${title}**\n\n${mine.length ? mine.map(item).join("\n\n") : "NONE"}`; };
  return {
    subject: `Weekly Listing Report - Week of ${weekOf(today)}`,
    body: `Hi ${toFirst || "there"}! Here's your weekly update on upcoming/active listings\n\n${part("Active/Coming Soon", "live")}\n\n${part("Upcoming", "upcoming")}\n\n${part("Withheld/No Timeline", "held")}`,
  };
}
