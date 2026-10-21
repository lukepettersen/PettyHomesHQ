import Link from "next/link";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

const tz = "America/Chicago";
const when = (d: Date) => d.toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).replace(/ (AM|PM)$/, (m) => m.trim().toLowerCase());

/** People → Mass emails: each send with how many opened (owner decision 2026-10-21: tracked for mass emails only). */
export default async function Page({ searchParams }: { searchParams: Promise<{ b?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const rows = await db.emailTrack.groupBy({ by: ["batch", "subject"], _count: { _all: true, openedAt: true }, _min: { sentAt: true }, orderBy: { _min: { sentAt: "desc" } }, take: 50 });
  const open = sp.b ? await db.emailTrack.findMany({ where: { batch: sp.b }, orderBy: [{ openedAt: { sort: "desc", nulls: "last" } }] }) : [];
  const names = new Map((await db.person.findMany({ where: { id: { in: open.map((o) => o.personId) } }, select: { id: true, name: true } })).map((p) => [p.id, p.name]));
  return (
    <div className="mx-auto max-w-4xl px-4 py-4">
      <Link href="/people" className="link text-sm">← People</Link>
      <h1 className="mt-2 text-2xl font-extrabold">Mass emails</h1>
      <p className="mb-4 mt-1 text-sm muted">How many people opened each one. &quot;Opened&quot; means probably read: iPhones can open emails on their own, and people who block images never show as opened.</p>
      {rows.length === 0 ? <p className="card p-4 text-sm muted">No mass emails yet. Select people on the People page and click Email.</p> : (
        <ul className="card divide-y divide-misty">
          {rows.map((r) => {
            const sent = r._count._all, opened = r._count.openedAt;
            return (
              <li key={r.batch}>
                <Link href={`/people/emails?b=${r.batch}`} className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-sunken ${sp.b === r.batch ? "bg-accent-soft" : ""}`}>
                  <span className="min-w-0"><b className="block truncate">{r.subject}</b><span className="text-xs muted">{r._min.sentAt ? when(r._min.sentAt) : ""}</span></span>
                  <span className="text-sm"><b>{opened}</b> of {sent} opened <span className="muted">({sent ? Math.round((opened / sent) * 100) : 0}%)</span></span>
                </Link>
                {sp.b === r.batch && (
                  <ul className="border-t border-misty bg-white px-4 py-2 text-sm">
                    {open.map((o) => (
                      <li key={o.id} className="flex justify-between gap-2 py-1">
                        <Link href={`/people/${o.personId}`} className="link">{names.get(o.personId) ?? "Deleted contact"}</Link>
                        <span className={o.openedAt ? "text-accent" : "muted"}>{o.openedAt ? `Opened ${when(o.openedAt)}` : "Not opened yet"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
