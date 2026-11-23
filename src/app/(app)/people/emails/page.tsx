import Link from "next/link";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { ResumeButton } from "./ResumeButton";

export const dynamic = "force-dynamic";

const tz = "America/Chicago";
const weekAgo = () => new Date(Date.now() - 7 * 86400000);
const when = (d: Date) => d.toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).replace(/ (AM|PM)$/, (m) => m.trim().toLowerCase());

/** People → Mass emails: each send with how many opened (owner decision 2026-10-21: tracked for mass emails only). */
export default async function Page({ searchParams }: { searchParams: Promise<{ b?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  // Sends still going (or stopped) in the last day, so a send in the background can be followed (owner report 2026-11-02).
  // Sends in the last week: who was selected, sent and skipped (by name, with why: owner request 2026-11-23).
  const jobs = await db.bulkEmailJob.findMany({ where: { userId: user.id, OR: [{ state: "sending" }, { createdAt: { gte: weekAgo() } }] }, orderBy: { createdAt: "desc" }, take: 8 });
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
            const notSent = (Array.isArray(j.notSent) ? j.notSent : []) as { name: string; why: string }[];
            const failed = (Array.isArray(j.failed) ? j.failed : []) as { name: string; error: string }[];
            const missed = [...notSent.map((x) => ({ name: x.name || "A contact", why: x.why })), ...failed.map((f) => ({ name: f.name, why: `Didn't send: ${f.error}` }))];
            const status = j.state === "sending" ? `Sending… ${done} of ${total} (about 40 a minute)` : j.state === "stopped" ? `Stopped at ${j.sent} of ${total}${j.error && j.error !== "Stopped." ? `: ${j.error}` : ""}` : `Sent to ${j.sent} of ${total} who could get it`;
            return (
              <li key={j.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0"><b className="block truncate">{j.subject}</b><span className="text-xs muted">{j.kind} · started {when(j.createdAt)}{j.selected ? ` · ${j.selected} selected` : ""}</span></span>
                  <span className="flex items-center gap-2"><span className={j.state === "stopped" ? "text-bad" : ""}>{status}</span>{j.state === "stopped" && <ResumeButton id={j.id} />}</span>
                </div>
                {missed.length > 0 && (
                  <details className="mt-1 rounded-md bg-sunken px-3 py-1.5">
                    <summary className="cursor-pointer text-xs font-semibold">Who didn&apos;t get it ({missed.length})</summary>
                    <ul className="mt-1 max-h-64 overflow-y-auto text-xs">{missed.map((x, i) => <li key={i} className="py-0.5"><b>{x.name}</b> <span className="muted">· {x.why}</span></li>)}</ul>
                  </details>
                )}
                {!missed.length && !j.selected && j.state !== "sending" && <p className="mt-1 text-xs muted">Sent before HQ kept the list of who was skipped{j.skipped ? `; ${j.skipped} already got it in the last 24 hours` : ""}{failed.length ? `; ${failed.length} didn't send` : ""}.</p>}
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
