// Smart list filters (SPEC.md §6.2). Pure so they can be unit tested; the People page applies them.

export type Filter = { field: FilterField; op: string; value: string };
export type FilterField = "stage" | "type" | "tag" | "source" | "followUp" | "lastContact" | "dueForTouch" | "upcomingTask" | "assigned";

export type PersonFacts = {
  stage: string | null;
  type: string | null; // partner type label: Realtor, Lender, Title…
  source: string | null;
  tags: string[];
  followUpDays: number | null;
  lastContactAt: Date | null;
  assignedTo: string | null; // user name
  hasUpcomingTask: boolean;
};

export const FIELD_LABELS: Record<FilterField, string> = {
  stage: "Stage",
  type: "Type",
  tag: "Tag",
  source: "Source",
  followUp: "Follow-up",
  lastContact: "Last contact",
  dueForTouch: "Due for a touch",
  upcomingTask: "Has an upcoming task",
  assigned: "Assigned to",
};

export const FIELD_OPS: Record<FilterField, [string, string][]> = {
  stage: [["is", "is"], ["isNot", "is not"]],
  type: [["is", "is"], ["isNot", "is not"]],
  tag: [["has", "has"], ["hasNot", "doesn't have"]],
  source: [["is", "is"], ["isNot", "is not"]],
  followUp: [["is", "is"]],
  lastContact: [["moreThan", "more than"], ["lessThan", "less than"], ["never", "never"]],
  dueForTouch: [["is", "is"]],
  upcomingTask: [["is", "is"]],
  assigned: [["is", "is"]],
};

const DAY = 86400000;

export function isDueForTouch(p: Pick<PersonFacts, "followUpDays" | "lastContactAt">, now = new Date()): boolean {
  if (!p.followUpDays) return false;
  if (!p.lastContactAt) return true;
  return now.getTime() - p.lastContactAt.getTime() >= p.followUpDays * DAY;
}

export function matches(p: PersonFacts, f: Filter, now = new Date()): boolean {
  const eq = (a: string | null) => (a ?? "").toLowerCase() === f.value.toLowerCase();
  switch (f.field) {
    case "stage":
      return f.op === "isNot" ? !eq(p.stage) : eq(p.stage);
    case "type":
      return f.op === "isNot" ? !eq(p.type) : eq(p.type);
    case "source":
      return f.op === "isNot" ? !eq(p.source) : eq(p.source);
    case "tag": {
      const has = p.tags.some((t) => t.toLowerCase() === f.value.toLowerCase());
      return f.op === "hasNot" ? !has : has;
    }
    case "followUp":
      return f.value === "none" ? !p.followUpDays : p.followUpDays === Number(f.value);
    case "lastContact": {
      if (f.op === "never") return !p.lastContactAt;
      const days = Number(f.value) || 0;
      if (!p.lastContactAt) return f.op === "moreThan";
      const ago = (now.getTime() - p.lastContactAt.getTime()) / DAY;
      return f.op === "moreThan" ? ago > days : ago < days;
    }
    case "dueForTouch":
      return isDueForTouch(p, now) === (f.value === "yes");
    case "upcomingTask":
      return p.hasUpcomingTask === (f.value === "yes");
    case "assigned":
      return eq(p.assignedTo);
    default:
      return true;
  }
}

export function matchesAll(p: PersonFacts, filters: Filter[], now = new Date()): boolean {
  return filters.every((f) => matches(p, f, now));
}

export function describeFilter(f: Filter): string {
  const op = FIELD_OPS[f.field]?.find(([k]) => k === f.op)?.[1] ?? f.op;
  if (f.field === "lastContact") return f.op === "never" ? "Never contacted" : `Last contact ${op} ${f.value} days ago`;
  if (f.field === "followUp") return f.value === "none" ? "No follow-up set" : `Follow-up every ${f.value} days`;
  if (f.field === "dueForTouch") return f.value === "yes" ? "Due for a touch" : "Not due for a touch";
  if (f.field === "upcomingTask") return f.value === "yes" ? "Has an upcoming task" : "No upcoming task";
  return `${FIELD_LABELS[f.field]} ${op} ${f.value}`;
}

/** Accepts whatever was stored and keeps only well-formed filters. */
export function parseFilters(raw: unknown): Filter[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is Filter => !!x && typeof x === "object" && typeof x.field === "string" && x.field in FIELD_LABELS && typeof x.op === "string" && typeof x.value === "string");
}
