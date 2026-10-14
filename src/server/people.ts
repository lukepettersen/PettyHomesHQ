import "server-only";
import { db } from "@/server/db";
import { matchesAll, parseFilters, isDueForTouch, type Filter, type PersonFacts } from "@/lib/filters";
import { todayCentral } from "@/lib/normalize";
import { partnerLabel } from "@/lib/partners";

export type PersonRow = PersonFacts & {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
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
      emails: { orderBy: { position: "asc" } },
      _count: { select: { tasks: { where: { completedAt: null, deletedAt: null, dueDate: { gte: today } } } } },
    },
  });
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
    };
    return {
      ...facts, id: p.id, name: p.name, company: p.company, phone: p.phones[0]?.number ?? null, email: p.emails[0]?.address ?? null, dueForTouch: isDueForTouch(facts),
      contactText: [...p.phones.map((x) => x.normalized), ...p.emails.map((x) => x.normalized), p.address ?? "", p.mailingName ?? ""].join(" ").toLowerCase(),
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
  return cols.map((c) => ({ id: c.id, name: c.name, lists: c.lists.map((l) => ({ id: l.id, name: l.name, filters: parseFilters(l.filters) })) }));
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
