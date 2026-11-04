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
    subject: `Contingency deadlines · week of ${weekStart(today).slice(5, 7)}/${weekStart(today).slice(8, 10)}`,
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
