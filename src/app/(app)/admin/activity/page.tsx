import Link from "next/link";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth";
import { centralDayStart } from "@/lib/texting";

export const dynamic = "force-dynamic";

// Admin → Activity (owner request 2026-10-27): what each team member did in HQ, one day at a time, from the
// activity log every change already writes (SPEC.md §3). Message bodies are never in it.
const KIND: Record<string, string> = { person: "Contacts", task: "Tasks", email: "Emails", text: "Texts", timelineEntry: "Notes & logs", purchaseAgreement: "Contracts", clientFile: "Deals", offer: "Offers", appointment: "Appointments", document: "Files" };
const clock = (d: Date) => d.toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" }).replace(/ (AM|PM)$/, (m) => m.trim().toLowerCase());
const dayIso = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(d);
const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  // Only the owner sees what the team did (owner request 2026-10-27), checked here on the server.
  if (!(await requireUser()).isOwner) return <div className="card p-6"><h1 className="text-xl font-extrabold">Activity</h1><p className="mt-1 text-sm muted">Only Luke can see this page.</p></div>;
  const sp = await searchParams;
  const today = dayIso(new Date());
  const day = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) && sp.day <= today ? sp.day : today;
  const team = await db.user.findMany({ where: { status: { not: "DISABLED" } }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const who = team.find((u) => u.id === sp.who)?.id ?? null;
  const from = centralDayStart(new Date(`${day}T12:00:00Z`)), to = centralDayStart(new Date(`${shift(day, 1)}T12:00:00Z`));
  const rows = await db.activityLog.findMany({
    where: { createdAt: { gte: from, lt: to }, ...(who ? { userId: who } : { userId: { not: null } }) },
    orderBy: { createdAt: "desc" }, take: 500, include: { user: { select: { name: true } } },
  });
  const counts = Object.entries(rows.reduce<Record<string, number>>((acc, r) => { const k = KIND[r.entity]; if (k) acc[k] = (acc[k] ?? 0) + 1; return acc; }, {}));
  const pill = (on: boolean) => (on ? "inline-flex rounded-full bg-charcoal px-2.5 py-0.5 text-xs font-semibold text-white" : "chip hover:bg-misty");
  const href = (o: { day?: string; who?: string | null }) => `/admin/activity?day=${o.day ?? day}${(o.who === undefined ? who : o.who) ? `&who=${o.who === undefined ? who : o.who}` : ""}`;
  const link = (r: (typeof rows)[number]) => r.entityId && r.entity === "person" ? `/people/${r.entityId}` : r.entityId && r.entity === "task" ? `/tasks?task=${r.entityId}` : null;
  return (
    <>
      <h1 className="text-2xl font-extrabold">Activity</h1>
      <p className="mb-4 mt-1 text-sm muted">What each person did in HQ: contacts, tasks, notes, emails, texts, deals and settings. Times are Central.</p>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <Link className="btn" href={href({ day: shift(day, -1) })}>← Earlier day</Link>
        <b className="px-1">{day === today ? "Today" : new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" })}</b>
        {day < today && <Link className="btn" href={href({ day: shift(day, 1) })}>Later day →</Link>}
        <span className="ml-auto flex flex-wrap gap-1">
          <Link className={pill(!who)} href={href({ who: null })}>Everyone</Link>
          {team.map((u) => <Link key={u.id} className={pill(who === u.id)} href={href({ who: u.id })}>{u.name.split(" ")[0]}</Link>)}
        </span>
      </div>
      {counts.length > 0 && <p className="mb-3 text-sm">{counts.map(([k, n]) => `${n} ${k.toLowerCase()}`).join(" · ")}</p>}
      <div className="card">
        {rows.length ? (
          <ul className="divide-y divide-misty">
            {rows.map((r) => {
              const to = link(r);
              return (
                <li key={r.id} className="grid grid-cols-[64px_90px_minmax(0,1fr)] gap-2 px-4 py-2 text-sm max-sm:grid-cols-[56px_minmax(0,1fr)]">
                  <span className="muted">{clock(r.createdAt)}</span>
                  <b className="max-sm:hidden">{r.user?.name.split(" ")[0] ?? "HQ"}</b>
                  <span className="break-words">{to ? <Link className="link" href={to}>{r.summary}</Link> : r.summary}</span>
                </li>
              );
            })}
          </ul>
        ) : <p className="p-6 text-center muted">Nothing recorded{who ? ` for ${team.find((u) => u.id === who)?.name.split(" ")[0]}` : ""} on this day.</p>}
      </div>
      {rows.length === 500 && <p className="mt-2 text-xs muted">Showing the latest 500 for this day.</p>}
    </>
  );
}
