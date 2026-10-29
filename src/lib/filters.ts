// Smart list filters (SPEC.md §6.2). Pure so they can be unit tested; the People page applies them.
// A filter is { field, op, value }; several values (any of / all of) are joined with "||".
import { todayCentral } from "@/lib/normalize";

export type Filter = { field: FilterField; op: string; value: string };
export type FilterField =
  | "stage" | "type" | "tag" | "source" | "assigned" | "followUp"
  | "lastContact" | "lastCall" | "lastText" | "lastEmail" | "created"
  | "birthday" | "homeiversary" | "hasEmail" | "hasPhone" | "dueForTouch" | "upcomingTask" | "pipeline";

export type PersonFacts = {
  stage: string | null;
  type: string | null; // partner type label: Realtor, Lender, Title…
  source: string | null;
  tags: string[];
  followUpDays: number | null;
  lastContactAt: Date | null;
  lastCallAt?: Date | null;
  lastTextAt?: Date | null;
  touchAfter?: Date | null; // "Spread out": not due before this day (a date)
  lastEmailAt?: Date | null;
  createdAt?: Date | null;
  assignedTo: string | null; // user name
  hasUpcomingTask: boolean;
  hasEmail?: boolean;
  hasPhone?: boolean;
  birthdays?: string[]; // "MM-DD"
  homeiversary?: string | null; // "MM-DD"
  /** Where their open deals sit (owner request 2026-10-29): "buyer:<stage>", "listing:<stage>", "uc:<Under Contract column>". */
  pipeline?: string[];
};

/** "buyer:Consult scheduled" → "Buyer · Consult scheduled"; "none" → "No open deal". */
export function pipelineLabel(v: string): string {
  if (v === "none") return "No open deal";
  const i = v.indexOf(":");
  const kind = v.slice(0, i), name = v.slice(i + 1);
  return `${kind === "buyer" ? "Buyer" : kind === "listing" ? "Seller" : "Under contract"} · ${name}`;
}

export const FIELD_LABELS: Record<FilterField, string> = {
  stage: "Stage", pipeline: "Pipeline status", type: "Type", tag: "Tags", source: "Source", assigned: "Assigned to", followUp: "Follow-up",
  lastContact: "Last contact (any)", lastCall: "Last call", lastText: "Last text", lastEmail: "Last email", created: "Added to HQ",
  birthday: "Birthday", homeiversary: "Homeiversary", hasEmail: "Has an email", hasPhone: "Has a phone",
  dueForTouch: "Due for a touch", upcomingTask: "Has an upcoming task",
};

const DAYS_OPS: [string, string][] = [["moreThan", "more than"], ["lessThan", "less than"], ["never", "never"]];
export const FIELD_OPS: Record<FilterField, [string, string][]> = {
  stage: [["isAny", "is any of"], ["isNot", "is none of"], ["is", "is"]],
  type: [["isAny", "is any of"], ["isNot", "is none of"], ["is", "is"]],
  tag: [["hasAny", "has any of"], ["hasAll", "has all of"], ["hasNone", "has none of"], ["has", "has"], ["hasNot", "doesn't have"]],
  source: [["isAny", "is any of"], ["isNot", "is none of"], ["is", "is"]],
  assigned: [["isAny", "is any of"], ["is", "is"]],
  followUp: [["isAny", "is any of"], ["is", "is"]],
  lastContact: DAYS_OPS, lastCall: DAYS_OPS, lastText: DAYS_OPS, lastEmail: DAYS_OPS,
  created: [["lessThan", "less than"], ["moreThan", "more than"]],
  birthday: [["within", "in the next"]], homeiversary: [["within", "in the next"]],
  hasEmail: [["is", "is"]], hasPhone: [["is", "is"]], dueForTouch: [["is", "is"]], upcomingTask: [["is", "is"]],
  pipeline: [["isAny", "is any of"], ["isNot", "is none of"]],
};
/** Fields whose value is a number of days. */
export const DAY_FIELDS: FilterField[] = ["lastContact", "lastCall", "lastText", "lastEmail", "created", "birthday", "homeiversary"];
/** Ops that take several values. */
export const MULTI_OPS = ["isAny", "isNot", "hasAny", "hasAll", "hasNone"];

const DAY = 86400000;
export const valuesOf = (f: Filter) => f.value.split("||").map((x) => x.trim()).filter(Boolean);

/** Due for a touch: longer than their follow-up since the last text (texts are the touch; owner, 2026-10-14). */
export function isDueForTouch(p: Pick<PersonFacts, "followUpDays" | "lastTextAt" | "touchAfter">, now = new Date()): boolean {
  if (!p.followUpDays) return false;
  if (p.touchAfter && p.touchAfter.getTime() > todayCentral(now).getTime()) return false;
  if (!p.lastTextAt) return true;
  return now.getTime() - p.lastTextAt.getTime() >= p.followUpDays * DAY;
}

/** Days from today until the next "MM-DD" (0 = today). */
export function daysUntil(mmdd: string, now = new Date()): number {
  const [m, d] = mmdd.split("-").map(Number);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let next = Date.UTC(now.getUTCFullYear(), m - 1, d);
  if (next < today) next = Date.UTC(now.getUTCFullYear() + 1, m - 1, d);
  return Math.round((next - today) / DAY);
}

export function matches(p: PersonFacts, f: Filter, now = new Date()): boolean {
  const lc = (a: string | null | undefined) => (a ?? "").toLowerCase();
  const vals = valuesOf(f).map((v) => v.toLowerCase());
  const one = (a: string | null | undefined) => {
    if (f.op === "isNot") return !vals.includes(lc(a));
    if (f.op === "isAny") return vals.includes(lc(a));
    return lc(a) === lc(f.value);
  };
  const ago = (d: Date | null | undefined) => {
    if (f.op === "never") return !d;
    if (!d) return f.op === "moreThan";
    const n = (now.getTime() - d.getTime()) / DAY;
    return f.op === "moreThan" ? n > (Number(f.value) || 0) : n < (Number(f.value) || 0);
  };
  const yes = f.value === "yes";
  switch (f.field) {
    case "stage": return one(p.stage);
    case "type": return one(p.type);
    case "source": return one(p.source);
    case "assigned": return f.op === "isAny" ? vals.includes(lc(p.assignedTo ?? "nobody")) : lc(p.assignedTo ?? "nobody") === lc(f.value);
    case "tag": {
      const has = (t: string) => p.tags.some((x) => x.toLowerCase() === t);
      if (f.op === "hasAny") return vals.some(has);
      if (f.op === "hasAll") return vals.every(has);
      if (f.op === "hasNone" || f.op === "hasNot") return !vals.some(has);
      return vals.some(has);
    }
    case "followUp": {
      const want = f.op === "isAny" ? valuesOf(f) : [f.value];
      return want.some((v) => (v === "none" ? !p.followUpDays : p.followUpDays === Number(v)));
    }
    case "lastContact": return ago(p.lastContactAt);
    case "lastCall": return ago(p.lastCallAt);
    case "lastText": return ago(p.lastTextAt);
    case "lastEmail": return ago(p.lastEmailAt);
    case "created": return ago(p.createdAt);
    case "birthday": return (p.birthdays ?? []).some((b) => daysUntil(b, now) <= (Number(f.value) || 0));
    case "homeiversary": return !!p.homeiversary && daysUntil(p.homeiversary, now) <= (Number(f.value) || 0);
    case "hasEmail": return !!p.hasEmail === yes;
    case "hasPhone": return !!p.hasPhone === yes;
    case "dueForTouch": return isDueForTouch(p, now) === yes;
    case "upcomingTask": return p.hasUpcomingTask === yes;
    case "pipeline": {
      const mine = (p.pipeline ?? []).map((x) => x.toLowerCase());
      const hit = vals.some((v) => (v === "none" ? !mine.length : mine.includes(v)));
      return f.op === "isNot" ? !hit : hit;
    }
    default: return true;
  }
}

export function matchesAll(p: PersonFacts, filters: Filter[], now = new Date()): boolean {
  return filters.every((f) => matches(p, f, now));
}

export function describeFilter(f: Filter): string {
  const op = FIELD_OPS[f.field]?.find(([k]) => k === f.op)?.[1] ?? f.op;
  const list = valuesOf(f).join(", ");
  if (DAY_FIELDS.includes(f.field) && f.field !== "birthday" && f.field !== "homeiversary") {
    if (f.op === "never") return f.field === "created" ? "Never added" : `${FIELD_LABELS[f.field]}: never`;
    return `${FIELD_LABELS[f.field]} ${op} ${f.value} days ago${f.op === "moreThan" && f.field !== "created" ? " (or never)" : ""}`;
  }
  if (f.field === "birthday" || f.field === "homeiversary") return `${FIELD_LABELS[f.field]} in the next ${f.value} days`;
  if (f.field === "followUp") return valuesOf(f).map((v) => (v === "none" ? "No follow-up set" : `Follow-up every ${v} days`)).join(" or ");
  if (f.field === "pipeline") return `${FIELD_LABELS.pipeline} ${op} ${valuesOf(f).map(pipelineLabel).join(", ")}`;
  if (["dueForTouch", "upcomingTask", "hasEmail", "hasPhone"].includes(f.field)) return `${FIELD_LABELS[f.field]}: ${f.value === "yes" ? "yes" : "no"}`;
  return `${FIELD_LABELS[f.field]} ${op} ${list}`;
}

/** Accepts whatever was stored and keeps only well-formed filters. */
export function parseFilters(raw: unknown): Filter[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is Filter => !!x && typeof x === "object" && typeof x.field === "string" && x.field in FIELD_LABELS && typeof x.op === "string" && typeof x.value === "string");
}
