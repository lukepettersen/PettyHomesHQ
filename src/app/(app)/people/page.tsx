import Link from "next/link";
import { applyFilters, loadCollections, loadOptions, loadPeopleRows, searchRows } from "@/server/people";
import { describeFilter } from "@/lib/filters";
import { daysAgo } from "@/lib/normalize";
import { AddPersonButton } from "./AddPersonButton";

export const dynamic = "force-dynamic";

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ list?: string; q?: string }> }) {
  const { list: listId, q = "" } = await searchParams;
  const [rows, collections, options] = await Promise.all([loadPeopleRows(), loadCollections(), loadOptions()]);
  const current = collections.flatMap((c) => c.lists.map((l) => ({ ...l, collection: c.name }))).find((l) => l.id === listId);
  const shown = searchRows(applyFilters(rows, current?.filters ?? []), q);

  return (
    <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-5 px-4 py-4 md:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="md:sticky md:top-3 md:self-start" aria-label="Smart lists">
        <Link href="/people" className={`flex justify-between rounded-md px-2.5 py-1.5 text-sm ${!current ? "bg-accent-soft font-bold text-accent" : "hover:bg-sunken"}`}>
          <span>All people</span><span className="muted">{rows.length}</span>
        </Link>
        {collections.map((c) => (
          <details key={c.id} open={c.lists.some((l) => l.id === listId) || undefined} className="mt-2">
            <summary className="cursor-pointer rounded-md px-2 py-1.5 text-sm font-bold hover:bg-sunken">{c.name}</summary>
            <div className="ml-3 flex flex-col">
              {c.lists.map((l) => (
                <Link key={l.id} href={`/people?list=${l.id}`} className={`flex justify-between rounded-md px-2.5 py-1.5 text-sm ${l.id === listId ? "bg-accent-soft font-bold text-accent" : "hover:bg-sunken"}`}>
                  <span>{l.name}</span><span className="muted">{applyFilters(rows, l.filters).length}</span>
                </Link>
              ))}
            </div>
          </details>
        ))}
        <p className="mt-3 px-2 text-xs muted">Editing smart lists arrives in the next update.</p>
      </aside>

      <main className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            {current && <span className="text-sm muted">{current.collection} ›</span>}
            <h1 className="text-2xl font-extrabold">{current?.name ?? "All people"}</h1>
            <span className="muted">{shown.length} {shown.length === 1 ? "person" : "people"}</span>
          </div>
          <div className="flex flex-1 justify-end gap-2" style={{ minWidth: 260 }}>
            <form className="w-full max-w-xs" action="/people">
              {listId && <input type="hidden" name="list" value={listId} />}
              <input className="input" type="search" name="q" defaultValue={q} placeholder="Search name, phone, email, tag…" aria-label="Search people" />
            </form>
            <AddPersonButton options={options} />
          </div>
        </div>

        {current && current.filters.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {current.filters.map((f, i) => <span key={i} className="chip">{describeFilter(f)}</span>)}
          </div>
        )}

        <div className="card mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-misty text-xs uppercase tracking-wide muted">
              <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Stage</th><th className="px-3 py-2">Last contact</th><th className="px-3 py-2">Follow up</th><th className="px-3 py-2">Tags</th><th className="px-3 py-2">Source</th></tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const ago = daysAgo(r.lastContactAt);
                return (
                  <tr key={r.id} className="border-b border-misty/60 last:border-0 hover:bg-paper">
                    <td className="px-3 py-2"><Link href={`/people/${r.id}`} className="link">{r.name}</Link>{r.phone && <div className="text-xs muted">{r.phone}</div>}</td>
                    <td className="px-3 py-2">{r.stage ?? <span className="muted">—</span>}</td>
                    <td className="px-3 py-2">{ago === null ? <span className="muted">Never</span> : ago === 0 ? "Today" : `${ago}d ago`}</td>
                    <td className="px-3 py-2">{r.followUpDays ? <span className={r.dueForTouch ? "font-semibold text-bad" : ""}>Every {r.followUpDays}d{r.dueForTouch ? " · due" : ""}</span> : <span className="muted">—</span>}</td>
                    <td className="px-3 py-2"><div className="flex flex-wrap gap-1">{r.tags.slice(0, 3).map((t) => <span key={t} className="chip">{t}</span>)}{r.tags.length > 3 && <span className="text-xs muted">+{r.tags.length - 3}</span>}</div></td>
                    <td className="px-3 py-2">{r.source ?? <span className="muted">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {shown.length === 0 && (
            <p className="p-8 text-center muted">{rows.length === 0 ? "No one here yet. Click “+ Add person” to add your first contact." : "No one matches."}</p>
          )}
        </div>
      </main>
    </div>
  );
}
