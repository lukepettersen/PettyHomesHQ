import "server-only";
import { db } from "@/server/db";
import { daysUntil, matchesAll, parseFilters, isDueForTouch, type Filter, type PersonFacts } from "@/lib/filters";
import { todayCentral } from "@/lib/normalize";
import { partnerLabel } from "@/lib/partners";
import { parseColumns } from "@/lib/columns";

export type PersonRow = PersonFacts & {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  mailingName: string | null;
  kids: string | null;
  dueForTouch: boolean;
  /** Every phone (digits), email, address and mailing name, for search. */
  contactText: string;
  company: string | null;
};

/** Everyone not in Trash, flattened for the People table and smart lists. */
export async function loadPeopleRows(): Promise<PersonRow[]> {
  const today = todayCentral();
  const people = await db.person.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    include: {
      stage: true,
      source: true,
      assignedTo: { select: { name: true } },
      tags: { include: { tag: true } },
      phones: { orderBy: { position: "asc" } },
      addresses: { select: { value: true } },
      emails: { orderBy: { position: "asc" } },
      dates: { select: { kind: true, date: true } },
      _count: { select: { tasks: { where: { completedAt: null, deletedAt: null, dueDate: { gte: today } } } } },
    },
  });
  // Last call / text / email from the timeline, for smart list filters and columns.
  const lastBy = new Map<string, Date>();
  for (const g of await db.timelineEntry.groupBy({ by: ["personId", "kind"], where: { deletedAt: null, kind: { in: ["call", "text", "email"] } }, _max: { createdAt: true } }))
    if (g._max.createdAt) lastBy.set(`${g.personId}:${g.kind}`, g._max.createdAt);
  const mmdd = (d: Date) => d.toISOString().slice(5, 10);
  return people.map((p) => {
    const facts: PersonFacts = {
      stage: p.stage?.name ?? null,
      type: partnerLabel(p.partnerType),
      source: p.source?.name ?? null,
      tags: p.tags.map((t) => t.tag.name).sort(),
      followUpDays: p.followUpDays,
      lastContactAt: p.lastContactAt,
      assignedTo: p.assignedTo?.name ?? null,
      hasUpcomingTask: p._count.tasks > 0,
      lastCallAt: lastBy.get(`${p.id}:call`) ?? null, lastTextAt: p.lastTextAt ?? lastBy.get(`${p.id}:text`) ?? null, touchAfter: p.touchAfter, lastEmailAt: lastBy.get(`${p.id}:email`) ?? null,
      createdAt: p.createdAt, hasEmail: p.emails.length > 0, hasPhone: p.phones.length > 0,
      birthdays: p.dates.filter((d) => d.kind === "birthday").map((d) => mmdd(d.date)),
      homeiversary: (() => { const h = p.dates.find((d) => d.kind === "homeiversary"); return h ? mmdd(h.date) : null; })(),
    };
    return {
      ...facts, id: p.id, name: p.name, company: p.company, address: p.address, mailingName: p.mailingName, kids: p.kids, phone: p.phones[0]?.number ?? null, email: p.emails[0]?.address ?? null, dueForTouch: isDueForTouch(facts),
      contactText: [...p.phones.map((x) => x.normalized), ...p.emails.map((x) => x.normalized), p.address ?? "", ...p.addresses.map((a) => a.value), p.mailingName ?? "", p.kids ?? ""].join(" ").toLowerCase(),
    };
  });
}

export function searchRows(rows: PersonRow[], q: string): PersonRow[] {
  const s = q.trim().toLowerCase();
  if (!s) return rows;
  const digits = s.replace(/\D/g, "");
  return rows.filter((r) =>
    [r.name, r.contactText, r.stage ?? "", r.type ?? "", r.company ?? "", r.source ?? "", ...r.tags].join(" ").toLowerCase().includes(s) ||
    (digits.length >= 3 && r.contactText.includes(digits)),
  );
}

export async function loadCollections() {
  const cols = await db.collection.findMany({ orderBy: { position: "asc" }, include: { lists: { orderBy: { position: "asc" } } } });
  return cols.map((c) => ({ id: c.id, name: c.name, lists: c.lists.map((l) => ({ id: l.id, name: l.name, filters: parseFilters(l.filters), columns: parseColumns(l.columns) })) }));
}

export function applyFilters(rows: PersonRow[], filters: Filter[]): PersonRow[] {
  return filters.length ? rows.filter((r) => matchesAll(r, filters)) : rows;
}

/** Lists used by forms: stages, sources, follow-up options, tags, team. */
export async function loadOptions() {
  const [stages, sources, follow, tags, team] = await Promise.all([
    db.stage.findMany({ orderBy: { position: "asc" } }),
    db.source.findMany({ orderBy: { position: "asc" } }),
    db.followUpOption.findMany({ orderBy: { position: "asc" } }),
    db.tag.findMany({ orderBy: { name: "asc" } }),
    db.user.findMany({ where: { status: { not: "DISABLED" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return {
    stages: stages.map((s) => ({ id: s.id, name: s.name })),
    sources: sources.map((s) => ({ id: s.id, name: s.name })),
    followUp: follow.map((f) => f.days),
    tags: tags.map((t) => t.name),
    team,
  };
}
export type Options = Awaited<ReturnType<typeof loadOptions>>;

/** Sorts like the People table's column headers (Name A–Z, dates most recent first, blanks last). */
export function sortRows(rows: PersonRow[], sort = "name"): PersonRow[] {
  const days = (d: Date | null | undefined) => (d ? -d.getTime() : Number.MAX_SAFE_INTEGER);
  const next = (r: PersonRow) => (r.birthdays?.length ? Math.min(...r.birthdays.map((b) => daysUntil(b))) : Number.MAX_SAFE_INTEGER);
  const key = (r: PersonRow): string | number => {
    switch (sort) {
      case "lastContact": return days(r.lastContactAt);
      case "lastCall": return days(r.lastCallAt);
      case "lastText": return days(r.lastTextAt);
      case "lastEmail": return days(r.lastEmailAt);
      case "created": return days(r.createdAt);
      case "followUp": return r.followUpDays ?? Number.MAX_SAFE_INTEGER;
      case "birthday": return next(r);
      case "tags": return r.tags.join(",").toLowerCase() || "~";
      case "assigned": return (r.assignedTo ?? "~").toLowerCase();
      case "homeiversary": return r.homeiversary ?? "~";
      case "stage": case "type": case "company": case "phone": case "email": case "source": case "address": case "mailingName": case "kids":
        return ((r as unknown as Record<string, string | null>)[sort] ?? "~").toLowerCase();
      default: return r.name.toLowerCase();
    }
  };
  return rows.map((r) => [key(r), r] as const).sort((a, b) => (typeof a[0] === "number" && typeof b[0] === "number" ? a[0] - b[0] : String(a[0]).localeCompare(String(b[0]))) || a[1].name.localeCompare(b[1].name)).map(([, r]) => r);
}

export const PAGE_SIZE = 100;
export type PeopleQuery = { list?: string; f?: string; q?: string; sort?: string };
function parseJson(s?: string): unknown { if (!s) return undefined; try { return JSON.parse(s); } catch { return undefined; } }

/** Everyone a People view shows (list, filters, search, sort): shared by the People page and the contact page's Prev / Next. */
export async function queryPeople(qp: PeopleQuery) {
  const [rows, collections] = await Promise.all([loadPeopleRows(), loadCollections()]);
  const lists = collections.flatMap((c) => c.lists.map((l) => ({ ...l, collection: c.name })));
  const current = lists.find((l) => l.id === qp.list);
  const urlFilters = parseJson(qp.f);
  const working = urlFilters !== undefined ? parseFilters(urlFilters) : current?.filters ?? [];
  const shown = sortRows(searchRows(applyFilters(rows, working), qp.q ?? ""), qp.sort);
  return { rows, collections, current, working, shown };
}
