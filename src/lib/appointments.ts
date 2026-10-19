// Appointments (SPEC.md §10). Pure, unit tested in appointments.test.ts.
import { splitCouple } from "@/lib/normalize";

export type ApptType = "call" | "buyer" | "seller" | "showing" | "other";
export const APPT_TYPES: [ApptType, string, number][] = [["call", "Phone Call", 30], ["buyer", "Buyer Consult", 60], ["seller", "Seller Consult", 60], ["showing", "Showing", 60], ["other", "Appointment", 60]];
export const apptLabel = (t: string) => APPT_TYPES.find(([k]) => k === t)?.[1] ?? "Appointment";

/** "Sam & Lena Ortiz" → "Ortiz"; "Sam Ortiz & Lena Brooks" → "Ortiz/Brooks"; "Cher" → "Cher". */
export function apptName(name: string): string {
  const parts = splitCouple(name).map((p) => p.trim()).filter(Boolean);
  const lasts = parts.map((p) => p.split(/\s+/).pop()!).filter(Boolean);
  if (parts.length > 1 && parts[0].split(/\s+/).length === 1) return lasts[lasts.length - 1]; // "Sam & Lena Ortiz"
  return [...new Set(lasts)].join("/");
}

/** Default title: "Ortiz - Phone Call"; Other starts as "Ortiz - " and needs a name. */
export const defaultTitle = (name: string, type: ApptType) => `${apptName(name)} - ${type === "other" ? "" : apptLabel(type)}`;

/** End time from a start time and length in minutes ("12:00" + 30 → "12:30"). */
export function addMinutes(start: string, mins: number): string {
  const [h, m] = start.split(":").map(Number);
  const t = Math.min(23 * 60 + 59, h * 60 + m + mins);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export type ApptView = { id: string | null; type: string; title: string; date: string; start: string | null; end: string | null; location: string; invitees: string[]; fromContract: boolean };

/** Soonest first; deadlines ("at 11:59pm") sort at the end of their day, other all-day items first. */
const sortKey = (a: ApptView) => a.date + (a.start ?? (a.title.includes("11:59pm") ? "23:59" : ""));
export const sortAppts = (a: ApptView, b: ApptView) => sortKey(a).localeCompare(sortKey(b));
