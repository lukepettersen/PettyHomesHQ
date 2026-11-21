import Link from "next/link";
import { loadEvents, loadTemplates } from "@/server/events";
import { longEventDate, shortEventDate } from "@/lib/events";
import { formatTime } from "@/lib/tasks";
import { isoFromDate } from "@/lib/normalize";
import { eventsGate } from "./gate";
import { NewEvent } from "./NewEvent";

export const dynamic = "force-dynamic";

type Ev = Awaited<ReturnType<typeof loadEvents>>[number];
const MONS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function Card({ e, past }: { e: Ev; past?: boolean }) {
  const when = e.next ?? e.last;
  const [, m, d] = (when ?? "").split("-").map(Number);
  return (
    <Link href={`/events/${e.id}`} className="card flex gap-3 p-4 transition hover:shadow-md hover:ring-1 hover:ring-accent/30">
      <div className={`flex h-16 w-16 flex-none flex-col items-center justify-center rounded-lg ${past || !when ? "bg-sunken text-muted" : "bg-accent-soft text-accent"}`}>
        {when ? <><span className="text-[10px] font-bold tracking-wider">{MONS[m - 1]}</span><span className="text-2xl font-extrabold leading-none">{d}</span></> : <span className="text-xs font-semibold">No date</span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <h2 className="truncate text-lg font-bold">{e.name}</h2>
          {e.signupOn && <span className="rounded-full bg-accent-soft px-2 text-xs font-semibold text-accent">Signup page on</span>}
        </div>
        <p className="text-sm">
          {e.multiSlot
            ? (e.next ? <>Next: <b>{(e.nextTitle || e.name).replace(/^Wolves /, "")}</b> · {longEventDate(e.next)}{e.nextTime ? ` · ${formatTime(e.nextTime)}` : ""}</> : e.slots ? `Season over · ${shortEventDate(e.first!)}–${shortEventDate(e.last!)}` : "No games yet")
            : (when ? <>{longEventDate(when)}{e.nextTime ? ` · ${formatTime(e.nextTime)}` : ""}</> : "Set the date")}
        </p>
        <p className="mt-1 flex flex-wrap gap-1.5 text-xs">
          {e.multiSlot && e.next && <span className="rounded-full bg-sunken px-2 py-0.5">{e.upcoming} games left</span>}
          {e.multiSlot && e.needPeople > 0 && <span className="rounded-full bg-[#f6efd9] px-2 py-0.5 font-semibold text-[#7a5d12]">{e.needPeople} need people</span>}
          {e.waiting > 0 && <span className="rounded-full bg-[#e3ecf7] px-2 py-0.5 font-semibold text-[#24507a]">{e.waiting} waiting</span>}
          <span className="rounded-full bg-sunken px-2 py-0.5">{e.attendees} {e.attendees === 1 ? "person" : "people"}</span>
        </p>
      </div>
    </Link>
  );
}

/** Events (owner request 2026-11-21; SPEC.md §6.7): client events like Timberwolves tickets and Pi Day pies. */
export default async function Page() {
  const { denied } = await eventsGate();
  if (denied) return denied;
  const [events, templates] = await Promise.all([loadEvents(), loadTemplates()]);
  const today = isoFromDate(new Date());
  const upcoming = events.filter((e) => e.next || !e.last), past = events.filter((e) => !e.next && e.last);
  return (
    <div className="mx-auto max-w-4xl px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold">Events</h1>
        <Link href="/events/templates" className="btn text-sm">Event templates</Link>
      </div>
      <NewEvent templates={templates.map((t) => ({ id: t.id, name: t.name, multiSlot: t.multiSlot }))} today={today} />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {upcoming.map((e) => <Card key={e.id} e={e} />)}
      </div>
      {!upcoming.length && <p className="card mt-4 p-5 text-sm muted">No upcoming events. Start one with + New event.</p>}
      {past.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer font-bold">Past events ({past.length})</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">{past.map((e) => <Card key={e.id} e={e} past />)}</div>
        </details>
      )}
    </div>
  );
}
