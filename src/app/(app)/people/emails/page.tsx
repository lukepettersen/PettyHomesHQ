import Link from "next/link";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

const tz = "America/Chicago";
const dayAgo = () => new Date(Date.now() - 86400000);
const when = (d: Date) => d.toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).replace(/ (AM|PM)$/, (m) => m.trim().toLowerCase());

/** People → Mass emails: each send with how many opened (owner decision 2026-10-21: tracked for mass emails only). */
export default async function Page({ searchParams }: { searchParams: Promise<{ b?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  // Sends still going (or stopped) in the last day, so a send in the background can be followed (owner report 2026-11-02).
  const jobs = await db.bulkEmailJob.findMany({ where: { userId: user.id, OR: [{ state: "sending" }, { state: "stopped", updatedAt: { gte: dayAgo() } }] }, orderBy: { createdAt: "desc" }, take: 5 });
  const rows = await db.emailTrack.groupBy({ by: ["batch", "subject"], _count: { _all: true, openedAt: true }, _min: { sentAt: true }, orderBy: { _min: { sentAt: "desc" } }, take: 50 });
  const open = sp.b ? await db.emailTrack.findMany({ where: { batch: sp.b }, orderBy: [{ openedAt: { sort: "desc", nulls: "last" } }] }) : [];
  const names = new Map((await db.person.findMany({ where: { id: { in: open.map((o) => o.personId) } }, select: { id: true, name: true } })).map((p) => [p.id, p.name]));
  return (
    <div className="mx-auto max-w-4xl px-4 py-4">
      <Link href="/people" className="link text-sm">← People</Link>
      <h1 className="mt-2 text-2xl font-extrabold">Mass emails</h1>
      <p className="mb-4 mt-1 text-sm muted">How many people opened each one. &quot;Opened&quot; means probably read: iPhones can open emails on their own, and people who block images never show as opened.</p>
      {jobs.length > 0 && (
        <ul className="card mb-4 divide-y divide-misty">
          {jobs.map((j) => {
            const total = (j.personIds as string[]).length, done = (j.doneIds as string[]).length;
            return (
              <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="min-w-0"><b className="block truncate">{j.subject}</b><span className="text-xs muted">{j.kind} · started {when(j.createdAt)}</span></span>
                <span className={j.state === "stopped" ? "text-bad" : ""}>{j.state === "sending" ? `Sending… ${done} of ${total} (about 40 a minute)` : `Stopped at ${j.sent} of ${total}${j.error && j.error !== "Stopped." ? `: ${j.error}` : ""}`}</span>
              </li>
            );
          })}
        </ul>
      )}
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
