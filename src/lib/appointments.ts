// Appointments (SPEC.md §10). Pure, unit tested in appointments.test.ts.
import { splitCouple } from "@/lib/normalize";

// Types: five built in (a phone call and consults start task templates) plus your own from Admin → Appointment types
// (owner request 2026-10-27). Built-ins can be renamed and resized, not removed.
export type ApptType = string;
export type ApptTypeDef = { key: string; label: string; mins: number };
export const BUILTIN_TYPES: ApptTypeDef[] = [{ key: "call", label: "Phone Call", mins: 30 }, { key: "buyer", label: "Buyer Consult", mins: 60 }, { key: "seller", label: "Seller Consult", mins: 60 }, { key: "showing", label: "Showing", mins: 60 }, { key: "other", label: "Appointment", mins: 60 }];
export const APPT_TYPES_KEY = "appointments.types";
const isCustom = (k: string) => /^c_[a-z0-9]{4,12}$/.test(k);
export const apptLabel = (t: string, types: ApptTypeDef[] = BUILTIN_TYPES) => types.find((x) => x.key === t)?.label ?? "Appointment";

/** Saved Admin list → the types to offer: built-ins first (with any new name or length), then your own, "Appointment" (other) last. */
export function apptTypes(saved: unknown): ApptTypeDef[] {
  const list = Array.isArray(saved) ? (saved as Partial<ApptTypeDef>[]) : [];
  const fix = (x: Partial<ApptTypeDef>, d?: ApptTypeDef): ApptTypeDef | null => {
    const key = d?.key ?? (typeof x.key === "string" && isCustom(x.key) ? x.key : null);
    const label = typeof x.label === "string" && x.label.trim() ? x.label.trim().slice(0, 40) : d?.label;
    const mins = typeof x.mins === "number" && x.mins >= 15 && x.mins <= 480 ? Math.round(x.mins / 15) * 15 : d?.mins ?? 60;
    return key && label ? { key, label, mins } : null;
  };
  const built = BUILTIN_TYPES.map((d) => fix(list.find((x) => x.key === d.key) ?? {}, d)!);
  const mine = list.filter((x) => typeof x.key === "string" && isCustom(x.key)).map((x) => fix(x)).filter((x): x is ApptTypeDef => !!x);
  return [...built.filter((x) => x.key !== "other"), ...mine, built.find((x) => x.key === "other")!];
}

/** Checks the Admin list before saving. Throws a message the person can fix. */
export function cleanApptTypes(raw: unknown): ApptTypeDef[] {
  if (!Array.isArray(raw) || raw.length > 40) throw new Error("Something went wrong. Reload and try again.");
  const out = apptTypes(raw);
  for (const x of raw as Partial<ApptTypeDef>[]) if (typeof x?.label !== "string" || !x.label.trim()) throw new Error("Every type needs a name.");
  const names = out.map((x) => x.label.toLowerCase());
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) throw new Error(`Two types are called "${dup}".`);
  return out;
}

/** "Sam & Lena Ortiz" → "Ortiz"; "Sam Ortiz & Lena Brooks" → "Ortiz/Brooks"; "Cher" → "Cher". */
export function apptName(name: string): string {
  const parts = splitCouple(name).map((p) => p.trim()).filter(Boolean);
  const lasts = parts.map((p) => p.split(/\s+/).pop()!).filter(Boolean);
  if (parts.length > 1 && parts[0].split(/\s+/).length === 1) return lasts[lasts.length - 1]; // "Sam & Lena Ortiz"
  return [...new Set(lasts)].join("/");
}

/** Default title: "Ortiz - Phone Call"; Other starts as "Ortiz - " and needs a name. */
export const defaultTitle = (name: string, type: ApptType, types: ApptTypeDef[] = BUILTIN_TYPES) => `${apptName(name)} - ${type === "other" ? "" : apptLabel(type, types)}`;

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
