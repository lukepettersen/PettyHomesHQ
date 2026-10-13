// Appointments (SPEC.md §10). Pure, unit tested in appointments.test.ts.

export type ApptType = "call" | "buyer" | "seller" | "showing" | "other";
export const APPT_TYPES: [ApptType, string, number][] = [["call", "Phone Call", 30], ["buyer", "Buyer Consult", 60], ["seller", "Seller Consult", 60], ["showing", "Showing", 60], ["other", "Appointment", 60]];
export const apptLabel = (t: string) => APPT_TYPES.find(([k]) => k === t)?.[1] ?? "Appointment";

/** "Sam & Lena Ortiz" → "Ortiz"; "Sam Ortiz & Lena Brooks" → "Ortiz/Brooks"; "Cher" → "Cher". */
export function apptName(name: string): string {
  const parts = name.split("&").map((p) => p.trim()).filter(Boolean);
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

export type ContractDates = { address: string; inspAppt?: string; inspection: string | null; writtenStatement: string | null; closing: string | null };
export type ApptView = { id: string | null; type: string; title: string; date: string; start: string | null; end: string | null; location: string; invitees: string[]; fromContract: boolean };

/** While a contract is active, its inspection appointment and deadlines show as appointments. */
export function contractAppointments(name: string, c: ContractDates): ApptView[] {
  const ln = apptName(name), out: ApptView[] = [];
  const auto = (title: string, date: string, start: string | null = null): ApptView => ({ id: null, type: "contract", title: `${ln} - ${title}`, date, start, end: null, location: c.address, invitees: [], fromContract: true });
  if (c.inspAppt) out.push(auto("Inspection", c.inspAppt.slice(0, 10), c.inspAppt.slice(11, 16)));
  if (c.inspection) out.push(auto("Inspection Deadline at 11:59pm", c.inspection));
  if (c.writtenStatement) out.push(auto("Written Statement Deadline", c.writtenStatement));
  if (c.closing) out.push(auto("Close Date HOLD", c.closing));
  return out;
}

/** Soonest first; deadlines ("at 11:59pm") sort at the end of their day, other all-day items first. */
const sortKey = (a: ApptView) => a.date + (a.start ?? (a.title.includes("11:59pm") ? "23:59" : ""));
export const sortAppts = (a: ApptView, b: ApptView) => sortKey(a).localeCompare(sortKey(b));
