import { requireUser } from "@/server/auth";
import { hasPermission } from "@/server/permissions";
import { applyFilters, loadCollections, loadOptions, loadPeopleRows, searchRows } from "@/server/people";
import { daysUntil, parseFilters } from "@/lib/filters";
import { parseColumns } from "@/lib/columns";
import { db } from "@/server/db";
import { daysAgo } from "@/lib/normalize";
import { AddPersonButton } from "./AddPersonButton";
import { Sidebar } from "./Sidebar";
import { FilterBar } from "./FilterBar";
import { PeopleTable } from "./PeopleTable";

export const dynamic = "force-dynamic";

function parseJson(s?: string): unknown { if (!s) return undefined; try { return JSON.parse(s); } catch { return undefined; } }

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ list?: string; q?: string; f?: string; new?: string }> }) {
  const sp = await searchParams;
  const q = sp.q ?? "";
  const user = await requireUser();
  const [rows, collections, options, allCols] = await Promise.all([loadPeopleRows(), loadCollections(), loadOptions(), db.appSetting.findUnique({ where: { key: "people.columns" } })]);
  const lists = collections.flatMap((c) => c.lists.map((l) => ({ ...l, collection: c.name })));
  const current = lists.find((l) => l.id === sp.list);
  const urlFilters = parseJson(sp.f);
  const working = urlFilters !== undefined ? parseFilters(urlFilters) : current?.filters ?? [];
  const shown = searchRows(applyFilters(rows, working), q);
  const columns = current ? current.columns : parseColumns(allCols?.value);
  const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
  const exportParams = new URLSearchParams({ ...(sp.list ? { list: sp.list } : {}), ...(sp.f ? { f: sp.f } : {}), ...(q ? { q } : {}) });

  return (
    <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-5 px-4 py-4 md:grid-cols-[250px_minmax(0,1fr)]">
      <Sidebar total={rows.length} currentId={current?.id}
        collections={collections.map((c) => ({ id: c.id, name: c.name, lists: c.lists.map((l) => ({ id: l.id, name: l.name, count: applyFilters(rows, l.filters).length })) }))} />
      <main className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            {current && <span className="text-sm muted">{current.collection} ›</span>}
            <h1 className="text-2xl font-extrabold">{current?.name ?? (sp.new ? "New smart list" : "All people")}</h1>
            <span className="muted">{shown.length} {shown.length === 1 ? "person" : "people"}</span>
          </div>
          <div className="flex flex-1 justify-end gap-2" style={{ minWidth: 260 }}>
            <form className="w-full max-w-xs" action="/people">
              {sp.list && <input type="hidden" name="list" value={sp.list} />}
              {sp.f && <input type="hidden" name="f" value={sp.f} />}
              <input className="input" type="search" name="q" defaultValue={q} placeholder="Search name, phone, email, tag…" aria-label="Search people" />
            </form>
            <AddPersonButton options={options} />
          </div>
        </div>
        <FilterBar key={`${current?.id}|${sp.f}|${sp.new}`} list={current ? { id: current.id, name: current.name, filters: current.filters } : undefined} working={working} q={q}
          startBuilding={!!sp.new && working.length === 0} newCollectionId={sp.new}
          collections={collections.map((c) => ({ id: c.id, name: c.name }))}
          options={{ stages: options.stages.map((s) => s.name), tags: options.tags, sources: options.sources.map((s) => s.name), followUp: options.followUp, team: options.team.map((u) => u.name) }} />
        <PeopleTable
          listId={current?.id ?? null} columns={columns}
          rows={shown.map((r) => ({
            id: r.id, name: r.name, phone: r.phone, email: r.email, stage: r.stage, type: r.type, company: r.company, address: r.address, mailingName: r.mailingName, kids: r.kids,
            assigned: r.assignedTo, source: r.source, tags: r.tags, followUpDays: r.followUpDays, dueForTouch: r.dueForTouch,
            lastDays: daysAgo(r.lastContactAt), callDays: daysAgo(r.lastCallAt ?? null), textDays: daysAgo(r.lastTextAt ?? null), emailDays: daysAgo(r.lastEmailAt ?? null),
            created: iso(r.createdAt), birthdayIn: r.birthdays?.length ? Math.min(...r.birthdays.map((b) => daysUntil(b))) : null,
            birthday: r.birthdays?.length ? [...r.birthdays].sort((a, b) => daysUntil(a) - daysUntil(b))[0] : null, homeiversary: r.homeiversary ?? null,
          }))}
          options={{ stages: options.stages, tags: options.tags, followUp: options.followUp, team: options.team }}
          canDelete={hasPermission(user.permissions, "deleteRecords")} canExport={hasPermission(user.permissions, "exportData")}
          exportHref={`/api/export/people?${exportParams}`}
          emptyText={rows.length === 0 ? "No one here yet. Click “+ Add person” to add your first contact." : "No one matches."} />
      </main>
    </div>
  );
}
