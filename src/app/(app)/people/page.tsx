import { requireUser } from "@/server/auth";
import { hasPermission } from "@/server/permissions";
import { applyFilters, loadCollections, loadOptions, loadPeopleRows, searchRows } from "@/server/people";
import { parseFilters } from "@/lib/filters";
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
  const [rows, collections, options] = await Promise.all([loadPeopleRows(), loadCollections(), loadOptions()]);
  const lists = collections.flatMap((c) => c.lists.map((l) => ({ ...l, collection: c.name })));
  const current = lists.find((l) => l.id === sp.list);
  const urlFilters = parseJson(sp.f);
  const working = urlFilters !== undefined ? parseFilters(urlFilters) : current?.filters ?? [];
  const shown = searchRows(applyFilters(rows, working), q);
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
          rows={shown.map((r) => ({ id: r.id, name: r.name, phone: r.phone, stage: r.stage, lastDays: daysAgo(r.lastContactAt), followUpDays: r.followUpDays, dueForTouch: r.dueForTouch, tags: r.tags, source: r.source }))}
          options={{ stages: options.stages, tags: options.tags, followUp: options.followUp, team: options.team }}
          canDelete={hasPermission(user.permissions, "deleteRecords")} canExport={hasPermission(user.permissions, "exportData")}
          exportHref={`/api/export/people?${exportParams}`}
          emptyText={rows.length === 0 ? "No one here yet. Click “+ Add person” to add your first contact." : "No one matches."} />
      </main>
    </div>
  );
}
