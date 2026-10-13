// Task templates and automations (SPEC.md §8). Pure, unit tested in templates.test.ts.

export type StepType = "task" | "call" | "text" | "email" | "tags";
export type Anchor = "start" | "phoneCall" | "consult" | "finalAcceptance" | "inspection" | "writtenStatement" | "hoaRescission" | "closing";
export type Cond = "always" | "hoa" | "pre1978" | "newc" | "fhava" | "condo";
export type Step = {
  id: string; name: string; assignee: string; // team member first name; "" = the person's assignee
  type: StepType; days: number; dir: "before" | "on" | "after" | "none" | "minutesBefore" | "minutesAfter"; anchor: Anchor; cond: Cond;
  minutes?: number; // with "minutesBefore"/"minutesAfter": 5, 10, 15, 30 or 60 minutes before/after the phone call or consult
  advance?: string; // status id to move the file to when done
  messageId?: string; // the text/email template it drafts (Admin → Text & email templates)
  message?: string; // a template name typed before templates existed; shown until one is picked
  addTags?: string[]; removeTags?: string[]; // "Add/remove tags" steps
};
export type Phase = { id: string; name: string; steps: Step[] };
export type Template = { id: string; name: string; trigger: string | null; folder?: string; phases: Phase[] };

export const ANCHORS: [Anchor, string][] = [["start", "Start date"], ["phoneCall", "Phone call"], ["consult", "Consult"], ["finalAcceptance", "Final Acceptance"], ["inspection", "Inspection"], ["writtenStatement", "Written Statement"], ["hoaRescission", "HOA Rescission"], ["closing", "Closing"]];
export const CONDS: [Cond, string][] = [["always", "Always"], ["hoa", "HOA property"], ["pre1978", "Built before 1978"], ["newc", "New construction"], ["fhava", "FHA / VA loan"], ["condo", "Condo / townhome"]];
export const STEP_TYPES: [StepType, string][] = [["task", "Task"], ["call", "Call"], ["email", "Email"], ["text", "Text"], ["tags", "Add/remove tags"]];
export const CONTRACT_ANCHORS: Anchor[] = ["finalAcceptance", "inspection", "writtenStatement", "hoaRescission", "closing"];
export const anchorLabel = (a: string) => ANCHORS.find(([k]) => k === a)?.[1] ?? a;

/** Triggers: "status:<id>", "pa:buyer", "pa:seller", "closed:buyer", "closed:seller", "phonecall", "buyerconsult", "sellerconsult", "anyconsult" (either), or none. */
export function triggerLabel(trigger: string | null, statuses: { id: string; kind: string; name: string }[]): string {
  if (!trigger) return "Apply by hand";
  if (trigger.startsWith("status:")) {
    const s = statuses.find((x) => x.id === trigger.slice(7));
    return s ? `When a ${s.kind === "buyer" ? "buyer" : "listing"} moves to ${s.name}` : "A status that was removed";
  }
  return ({ "pa:buyer": "When a buyer-side purchase agreement is added", "pa:seller": "When a seller-side purchase agreement is added",
    "closed:buyer": "When a buyer-side contract closes", "closed:seller": "When a seller-side contract closes", phonecall: "When a phone call is booked",
    buyerconsult: "When a buyer consultation is booked", sellerconsult: "When a seller consultation is booked", anyconsult: "When a buyer or seller consultation is booked" } as Record<string, string>)[trigger] ?? trigger;
}

/** Facts that conditions read: from the contract, or the listing file. */
export type Facts = { hoa?: string; year?: string; newc?: string; fin?: string; ptype?: string };
export function condMet(cond: Cond, f: Facts): boolean {
  switch (cond) {
    case "hoa": return f.hoa === "Yes";
    case "pre1978": return !!f.year && Number(f.year) > 0 && Number(f.year) < 1978;
    case "newc": return f.newc === "Yes";
    case "fhava": return f.fin === "FHA" || f.fin === "VA";
    case "condo": return f.ptype === "Condo" || f.ptype === "Townhome";
    default: return true;
  }
}

const DAY = 86400000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
/** "Minutes before/after" works for anchors that have a time of day (the booked phone call or consult). */
export const minutesOffset = (s: Pick<Step, "dir" | "minutes">) => (s.dir === "minutesBefore" ? s.minutes ?? 15 : s.dir === "minutesAfter" ? -(s.minutes ?? 15) : null);
export const MINUTE_OPTIONS = [5, 10, 15, 30, 60];
export const TIMED_ANCHORS: Anchor[] = ["phoneCall", "consult"];
/** "14:00" minus 15 minutes → "13:45"; a negative number counts forward (minutes after). Stays within the day. */
export function timeBefore(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const t = Math.min(23 * 60 + 59, Math.max(0, h * 60 + m - minutes));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export const offsetOf = (s: Pick<Step, "days" | "dir">) => (s.dir === "before" ? -s.days : s.dir === "after" ? s.days : 0);

/** Due date from the step's anchor: null means "waits for that date" (or no due date). */
export function dueFor(s: Pick<Step, "days" | "dir" | "anchor">, dates: Partial<Record<Anchor, string | null>>): string | null {
  if (s.dir === "none") return null;
  const base = dates[s.anchor];
  return base ? addDays(base, offsetOf(s)) : null;
}

export type TaskSpec = { step: Step; phase: string; due: string | null; waiting: boolean };

/** The tasks a template creates: steps whose condition is met, dated from the anchors. */
export function expand(t: Template, dates: Partial<Record<Anchor, string | null>>, facts: Facts): { tasks: TaskSpec[]; skipped: number } {
  const tasks: TaskSpec[] = [];
  let skipped = 0;
  for (const p of t.phases) for (const s of p.steps) {
    if (!condMet(s.cond, facts)) { skipped++; continue; }
    const due = dueFor(s, dates);
    tasks.push({ step: s, phase: p.name, due, waiting: s.dir !== "none" && !due });
  }
  return { tasks, skipped };
}

/** "Inspection − 2 days", "Start date + 3 days", "Closing day of". */
export function timingLabel(s: Pick<Step, "days" | "dir" | "anchor" | "minutes">): string {
  if (s.dir === "none") return "No due date";
  const a = anchorLabel(s.anchor);
  if (s.dir === "minutesBefore") return `${s.minutes ?? 15} minutes before ${a}`;
  if (s.dir === "minutesAfter") return `${s.minutes ?? 15} minutes after ${a}`;
  if (s.dir === "on" || s.days === 0) return `${a} day of`;
  return `${a} ${s.dir === "before" ? "−" : "+"} ${s.days} day${s.days === 1 ? "" : "s"}`;
}

/** Checks an edited template before saving. Returns a plain message or null. */
export function templateProblem(t: Template): string | null {
  if (!t.name.trim()) return "Give the template a name.";
  for (const p of t.phases) {
    if (!p.name.trim()) return "Every phase needs a name.";
    for (const s of p.steps) {
      if (!s.name.trim()) return `A step in "${p.name}" needs a name.`;
      if (s.type === "tags" && !(s.addTags?.length || s.removeTags?.length)) return `"${s.name}" needs tags to add or remove.`;
      if (s.days < 0 || s.days > 730) return `"${s.name}": use 0 to 730 days.`;
      const byMinutes = s.dir === "minutesBefore" || s.dir === "minutesAfter";
      if (byMinutes && !TIMED_ANCHORS.includes(s.anchor)) return `"${s.name}": minutes before/after only works with the Phone call or Consult (they have a time).`;
      if (byMinutes && !MINUTE_OPTIONS.includes(s.minutes ?? 0)) return `"${s.name}": pick 5, 10, 15, 30 or 60 minutes.`;
    }
  }
  return null;
}

export const newId = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 9)}`;
