// Ask Claude (SPEC.md §9.6): turns what someone says ("remind me to call Sam Tuesday at 2",
// "note on the Ortizes: they want a bigger yard, @Alyssa send listings") into proposed tasks and
// notes. Nothing is saved until the person clicks Save. Unit tested in assistant.test.ts.
import { parseTime } from "@/lib/tasks";

export const TASK_KINDS = ["task", "followup", "call", "text", "email", "showing", "closing", "other"] as const;
export const NOTE_KINDS = ["note", "call", "text"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];
export type NoteKind = (typeof NOTE_KINDS)[number];

export type TaskProposal = { type: "task"; title: string; kind: TaskKind; personId: string | null; personName: string | null; assigneeId: string; assigneeName: string; due: string; time: string | null };
export type NoteProposal = { type: "note"; kind: NoteKind; personId: string; personName: string; body: string };
export type Proposal = TaskProposal | NoteProposal;

type Named = { id: string; name: string };
type Raw = Record<string, unknown>;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const validIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;

/**
 * Checks a proposed task from Claude against real people and teammates. Returns null when it
 * can't be used as-is (no title, or a person id that doesn't exist).
 */
export function cleanTask(raw: Raw, ctx: { people: Map<string, string>; team: Named[]; meId: string; today: string }): TaskProposal | null {
  const title = str(raw.title, 300);
  if (!title) return null;
  const pid = str(raw.person_id, 40);
  if (pid && !ctx.people.has(pid)) return null;
  const kind = (TASK_KINDS as readonly string[]).includes(str(raw.kind, 20)) ? (str(raw.kind, 20) as TaskKind) : "followup";
  const assignee = ctx.team.find((t) => t.id === str(raw.assignee_id, 40)) ?? ctx.team.find((t) => t.id === ctx.meId);
  if (!assignee) return null;
  const dueRaw = str(raw.due, 10);
  const due = validIso(dueRaw) ? dueRaw : ctx.today;
  const timeRaw = str(raw.time, 20);
  const time = timeRaw ? parseTime(timeRaw) : null;
  return { type: "task", title: title[0].toUpperCase() + title.slice(1), kind, personId: pid || null, personName: pid ? ctx.people.get(pid)! : null, assigneeId: assignee.id, assigneeName: assignee.name, due, time };
}

/** Checks a proposed note / logged call / logged text. A note always needs a real contact. */
export function cleanNote(raw: Raw, ctx: { people: Map<string, string> }): NoteProposal | null {
  const body = str(raw.body, 10000);
  const pid = str(raw.person_id, 40);
  if (!body || !pid || !ctx.people.has(pid)) return null;
  const kind = (NOTE_KINDS as readonly string[]).includes(str(raw.kind, 10)) ? (str(raw.kind, 10) as NoteKind) : "note";
  return { type: "note", kind, personId: pid, personName: ctx.people.get(pid)!, body };
}

/** Today's date with weekday and the next 14 days, so dates like "next Tuesday" come out right. */
export function calendarHint(today: string): string {
  const base = new Date(`${today}T12:00:00Z`);
  const days = Array.from({ length: 15 }, (_, i) => {
    const d = new Date(base.getTime() + i * 86400000);
    return `${d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })} ${d.toISOString().slice(0, 10)}`;
  });
  return `Today is ${days[0]}. Coming days: ${days.slice(1).join(", ")}.`;
}
